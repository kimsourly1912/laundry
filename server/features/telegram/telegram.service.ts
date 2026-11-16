import type { OrderTelegramStatus, TelegramInvite } from '#shared/contracts/telegram'
import type { Order } from '#shared/contracts/orders'
import { toE164 } from '#shared/contracts/phone'
import type { Db } from '#server/utils/batch'
import { log } from '#server/utils/log'
import type { ShopActor } from '#server/features/identity'
import { orderInShop } from '#server/features/orders'
import { shopProfile } from '#server/features/shops'
import type { ShopProfile } from '#server/features/shops'
import { renderOrderReceipt } from '#server/features/receipts'
import { countOrderListeners, deliverDue, linkStatement, orderMessages, queueChatMessageStatement } from '#server/features/notifications'
import type { DeliveryReport, OutboxMessage, SendOutcome } from '#server/features/notifications'
import type { TelegramBot } from './telegram.bot'
import { createTelegramBot, isChatGone, isTelegramApiError } from './telegram.bot'
import { telegramOff } from './telegram.errors'
import { BOTH, isOnlyThisOrder, receiptCaption, receiptText, statusText, textsFor } from './telegram.messages'
import * as repo from './telegram.repository'
import type { TelegramUpdate } from './telegram.update'

/**
 * The shop's Telegram (D28, spec §8.2–§8.3). The counter shows a QR for an order; the person scans
 * it and the bot asks for their phone. The customer's own phone links every order of theirs, now
 * and later; any other answer links this order only, so a photo of the QR never gives someone a
 * customer's future messages. Then the order's receipt is sent, and each ready / collected after.
 */

const INVITE_TTL_MS = 24 * 60 * 60 * 1000
/** Spec §8.2: a scan waits 10 minutes for the phone. */
const PENDING_TTL_MS = 10 * 60 * 1000

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

/** 32 random bytes, base64url: 43 characters, inside Telegram's 64 for a start parameter. */
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * A QR for the order, to show at the counter: a new token each time, valid a day. Only its hash is
 * stored. Another shop's order is 404 like a missing one.
 */
export async function createInvite(db: Db, actor: ShopActor, orderId: string, options: { botUsername: string, now?: Date }): Promise<TelegramInvite> {
  const { botUsername, now = new Date() } = options
  if (!botUsername) throw telegramOff()
  await orderInShop(db, actor.shopId, orderId)
  const token = newToken()
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS)
  await repo.insertInviteStatement(db, { tokenHash: await sha256Hex(token), shopId: actor.shopId, orderId, expiresAt, now })
  return { url: `https://t.me/${botUsername}?start=${token}`, expiresAt: expiresAt.toISOString() }
}

/** Whether the order's customer hears about it, and what was sent (the order page). 404 for another shop's. */
export async function orderTelegramStatus(db: Db, actor: ShopActor, orderId: string): Promise<OrderTelegramStatus> {
  const order = await orderInShop(db, actor.shopId, orderId)
  const key = { shopId: actor.shopId, orderId }
  const [chats, messages] = await Promise.all([countOrderListeners(db, { ...key, customerId: order.customer.id }), orderMessages(db, key)])
  return {
    chats,
    messages: messages.map(row => ({ kind: row.kind, status: row.status, createdAt: row.createdAt.toISOString(), sentAt: row.sentAt?.toISOString() ?? null })),
  }
}

// --- The webhook ---

interface UpdateOptions {
  bot: TelegramBot
  now?: Date
}

/** Text after `/start` (the QR's token), or `undefined` for another message. */
function startParameter(text: string | undefined): string | undefined {
  const match = text && /^\/start(?:@\w+)?(?:\s+(\S+))?\s*$/.exec(text.trim())
  return match ? (match[1] ?? '') : undefined
}

/**
 * One update from Telegram's webhook. Only private chats with a person count; anything the bot
 * doesn't expect gets the short help. Safe when Telegram sends the same update twice: a scan only
 * replaces the waiting state, and a link that exists is kept.
 */
export async function handleUpdate(db: Db, update: TelegramUpdate, options: UpdateOptions): Promise<void> {
  const { bot, now = new Date() } = options
  const message = update.message
  if (!message?.from || message.from.is_bot || message.chat.type !== 'private') return
  const person = { telegramUserId: String(message.from.id), chatId: String(message.chat.id) }

  const token = startParameter(message.text)
  if (token !== undefined) return onScan(db, bot, person, token, now)
  if (message.contact) return onContact(db, bot, person, { phone: message.contact.phone_number, userId: message.contact.user_id }, now)
  if (message.text && isOnlyThisOrder(message.text)) {
    const pending = await repo.findLivePending(db, person.telegramUserId, now)
    if (pending) return linkAndSend(db, bot, { ...person, ...pending, everyOrder: false }, now)
  }
  await bot.sendMessage(person.chatId, BOTH.help)
}

interface Person {
  telegramUserId: string
  chatId: string
}

/** The order and shop a QR or a waiting scan leads to, while the shop is active. */
async function orderAndShop(db: Db, shopId: string, orderId: string): Promise<{ order: Order, shop: ShopProfile } | undefined> {
  const shop = await shopProfile(db, shopId)
  if (shop?.status !== 'active') return undefined
  const order = await orderInShop(db, shopId, orderId).catch(() => undefined)
  return order && { order, shop }
}

/** A QR scanned: ask for the phone, or, when the customer has none to prove, link the order. */
async function onScan(db: Db, bot: TelegramBot, person: Person, token: string, now: Date): Promise<void> {
  const invite = /^[\w-]{20,64}$/.test(token) ? await repo.findLiveInvite(db, await sha256Hex(token), now) : undefined
  const found = invite && await orderAndShop(db, invite.shopId, invite.orderId)
  if (!invite || !found) {
    await bot.sendMessage(person.chatId, token ? BOTH.invalidCode : BOTH.help)
    return
  }
  const { order, shop } = found
  if (!order.customer.phone) {
    // A walk-in or an anonymized customer: no phone to prove, so this order only.
    await linkAndSend(db, bot, { ...person, shopId: invite.shopId, orderId: invite.orderId, everyOrder: false }, now)
    return
  }
  await repo.upsertPendingStatement(db, { ...person, shopId: invite.shopId, orderId: invite.orderId, expiresAt: new Date(now.getTime() + PENDING_TTL_MS) })
  const text = textsFor(shop.language)
  await bot.sendMessage(person.chatId, text.askPhone(shop.name, order.number), {
    keyboard: [[{ text: text.sharePhone, request_contact: true }], [{ text: text.onlyThisOrder }]],
    one_time_keyboard: true,
    resize_keyboard: true,
  })
}

/**
 * A shared contact. Only the person's own counts (`user_id` is theirs): anyone can forward someone
 * else's contact card. The customer's phone links every order; another number, this order only.
 */
async function onContact(db: Db, bot: TelegramBot, person: Person, contact: { phone: string, userId?: number }, now: Date): Promise<void> {
  const pending = await repo.findLivePending(db, person.telegramUserId, now)
  if (!pending) {
    await bot.sendMessage(person.chatId, BOTH.help, { remove_keyboard: true })
    return
  }
  const found = await orderAndShop(db, pending.shopId, pending.orderId)
  if (!found) {
    await bot.sendMessage(person.chatId, BOTH.invalidCode, { remove_keyboard: true })
    return
  }
  if (contact.userId === undefined || String(contact.userId) !== person.telegramUserId) {
    await bot.sendMessage(person.chatId, textsFor(found.shop.language).notYourContact)
    return
  }
  const phone = toE164(contact.phone.startsWith('+') ? contact.phone : `+${contact.phone}`)
  const everyOrder = phone !== null && phone === found.order.customer.phone
  await linkAndSend(db, bot, { ...person, ...pending, everyOrder }, now)
}

interface NewLink extends Person {
  shopId: string
  orderId: string
  /** The customer's phone was proved: every order of theirs. */
  everyOrder: boolean
}

/** Links the chat, queues the order's receipt, says so, and sends the receipt right away. */
async function linkAndSend(db: Db, bot: TelegramBot, link: NewLink, now: Date): Promise<void> {
  const { telegramUserId, chatId, shopId, orderId, everyOrder } = link
  const found = await orderAndShop(db, shopId, orderId)
  if (!found) {
    await bot.sendMessage(chatId, BOTH.invalidCode, { remove_keyboard: true })
    return
  }
  const { order, shop } = found
  await db.batch([
    linkStatement(db, { shopId, customerId: order.customer.id, orderId: everyOrder ? null : orderId, telegramUserId, chatId }, now),
    queueChatMessageStatement(db, { shopId, orderId, chatId, kind: 'receipt' }, now),
    repo.deletePendingStatement(db, telegramUserId),
  ])
  const text = textsFor(shop.language)
  await bot.sendMessage(chatId, everyOrder ? text.linkedCustomer(shop.name) : text.linkedOrder(shop.name, order.number), { remove_keyboard: true })
  await deliverOutbox(db, { bot, now, orderId })
}

// --- Sending the outbox ---

/** One queued message, through the bot: what it says, and what Telegram's answer means for it. */
export async function sendOutboxMessage(db: Db, bot: TelegramBot, message: OutboxMessage): Promise<SendOutcome> {
  const found = await orderAndShop(db, message.shopId, message.orderId)
  if (!found) return { status: 'skipped', error: 'The shop is suspended or the order is gone' }
  const { order, shop } = found
  try {
    if (message.kind === 'receipt') {
      const png = await renderOrderReceipt(db, message.shopId, message.orderId)
      if (png) await bot.sendPhoto(message.chatId, png, receiptCaption(order, shop.name, shop.language))
      else await bot.sendMessage(message.chatId, receiptText(order, shop.name, shop.language))
    }
    else {
      await bot.sendMessage(message.chatId, statusText(message.kind, order, shop.name, shop.language))
    }
    return { status: 'sent' }
  }
  catch (error) {
    if (!isTelegramApiError(error)) return { status: 'retry', error: String((error as Error)?.message ?? error) }
    if (isChatGone(error)) return { status: 'skipped', error: error.message, chatGone: true }
    // Limited, Telegram's trouble, or our token (401/404): worth another try later.
    if (error.status === 429 || error.status >= 500 || error.status === 401 || error.status === 404) return { status: 'retry', error: error.message, afterMs: error.retryAfterMs }
    return { status: 'failed', error: error.message }
  }
}

/** Sends what's due through the bot (the per-minute job; right after a link, for that order). */
export async function deliverOutbox(db: Db, options: { bot: TelegramBot, now?: Date, orderId?: string }): Promise<DeliveryReport> {
  const { bot, now = new Date(), orderId } = options
  return deliverDue(db, { send: message => sendOutboxMessage(db, bot, message), now, orderId })
}

/** Deletes expired QR tokens and waiting scans (the daily purge). */
export async function purgeTelegram(db: Db, now = new Date()): Promise<void> {
  await repo.purgeExpired(db, now)
  log('info', 'Purged expired Telegram invites')
}

/**
 * Whether a webhook call carries our secret (`X-Telegram-Bot-Api-Secret-Token`, set with
 * `setWebhook`). Compared in constant time; an empty secret matches nothing.
 */
export function webhookSecretMatches(expected: string, given: string | undefined): boolean {
  if (!expected || given === undefined || given.length !== expected.length) return false
  let difference = 0
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ given.charCodeAt(i)
  return difference === 0
}

/**
 * An order's queued messages, sent right after the response (for the route's `waitUntil`), so
 * "ready" reaches the customer at once rather than at the next minute's job. A failure stays in
 * the outbox for the job; this never throws.
 */
export async function deliverOrderSoon(db: Db, options: { botToken: string, orderId: string }): Promise<void> {
  const { botToken, orderId } = options
  try {
    await deliverOutbox(db, { bot: createTelegramBot(botToken), orderId })
  }
  catch (error) {
    log('warn', 'Sending right away failed; the job retries', { orderId, error: String(error) })
  }
}
