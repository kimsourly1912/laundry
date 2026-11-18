import type { OrderTelegram } from '#shared/contracts/telegram'
import { formatMoney } from '#shared/format'
import type { Db } from '#server/utils/batch'
import { log } from '#server/utils/log'
import type { ShopActor } from '#server/features/identity'
import { getOrder, orderSlip } from '#server/features/orders'
import { shopStatus } from '#server/features/shops'
import { renderFilledSlip } from '#server/features/templates'
import { deliverDue, linkStatement, orderMessages, queueChatMessageStatement } from '#server/features/notifications'
import type { DeliveryReport, OutboxMessage, SendOutcome } from '#server/features/notifications'
import type { TelegramBot } from './telegram.bot'
import { isChatGone, isTelegramApiError } from './telegram.bot'
import type { TelegramUpdate } from './telegram.update'
import { orderCancelled, telegramNotSetUp } from './telegram.errors'
import * as repo from './telegram.repository'

/**
 * An order's slip on Telegram (plan §3 steps 5–6, §8, step 4; D28): the shop shows a QR, the customer
 * scans it and taps Start, and the bot sends the filled slip as a picture. No phone check (Q11).
 * Links are per order, so a QR never reaches another order (security.md → Telegram links).
 */

/** A QR is valid this long; the daily purge deletes it after. */
export const INVITE_TTL_MS = 24 * 60 * 60 * 1000

/** 32 random bytes as base64url: 43 characters, inside Telegram's 64 for a start parameter. */
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

interface InviteOptions {
  orderId: string
  /** The bot's username (`NUXT_TELEGRAM_BOT_USERNAME`); empty: no bot, no QR. */
  botUsername: string
  now?: Date
}

/**
 * A new QR for the shop's order (404 for another shop's, 409 for a cancelled one), and what its
 * chats were sent. Only the token's hash is stored; the token is in the answer once.
 */
export async function createOrderInvite(db: Db, actor: ShopActor, options: InviteOptions): Promise<OrderTelegram> {
  const { orderId, botUsername, now = new Date() } = options
  const order = await getOrder(db, actor, orderId)
  if (!botUsername) throw telegramNotSetUp()
  if (order.status === 'cancelled') throw orderCancelled()
  const token = newToken()
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS)
  await db.batch([repo.insertInviteStatement(db, { tokenHash: await sha256(token), shopId: actor.shopId, orderId, expiresAt, now })])
  const messages = await orderMessages(db, { shopId: actor.shopId, orderId })
  return {
    url: `https://t.me/${botUsername}?start=${token}`,
    expiresAt: expiresAt.toISOString(),
    messages: messages.map(message => ({ status: message.status, createdAt: message.createdAt.toISOString(), sentAt: message.sentAt?.toISOString() ?? null })),
  }
}

export const BOT_TEXT = {
  scanAtShop: 'Scan the QR code at the laundry to get your slip here.',
  expired: 'This QR code has expired. Ask the laundry to show it again.',
  sending: 'Thank you. Your slip is on its way.',
} as const

/**
 * One update from the webhook: `/start <token>` in a private chat links that chat to the token's
 * order and queues its slip, in one batch. Telegram sends an update again until it gets a 200, so
 * this is safe to repeat: the link and the message are each once per order and chat. Returns the
 * order whose slip is now queued, for the caller to deliver at once.
 */
export async function handleUpdate(db: Db, update: TelegramUpdate, options: { bot: TelegramBot, now?: Date }): Promise<{ orderId: string } | undefined> {
  const { bot, now = new Date() } = options
  const message = update.message
  if (!message || message.chat.type !== 'private' || !message.from || message.from.is_bot) return undefined
  const chatId = String(message.chat.id)
  const reply = (text: string) => bot.sendMessage(chatId, text).catch((error: unknown) => log('warn', 'A Telegram reply failed', { error: String((error as Error)?.message ?? error) }))
  const token = /^\/start\s+([\w-]{1,64})$/.exec(message.text?.trim() ?? '')?.[1]
  if (!token) {
    await reply(BOT_TEXT.scanAtShop)
    return undefined
  }
  const invite = await repo.findLiveInvite(db, await sha256(token), now)
  if (!invite) {
    await reply(BOT_TEXT.expired)
    return undefined
  }
  const { shopId, orderId } = invite
  await db.batch([
    linkStatement(db, { shopId, orderId, telegramUserId: String(message.from.id), chatId }, now),
    queueChatMessageStatement(db, { shopId, orderId, chatId, kind: 'slip' }, now),
  ])
  await reply(BOT_TEXT.sending)
  return { orderId }
}

/**
 * Sends one queued message: the order's slip as a PNG, drawn on the order's own version. Never for
 * a suspended shop or a missing order (`skipped`); a blocked bot ends the chat's links.
 */
export async function sendSlipMessage(db: Db, bot: TelegramBot, message: OutboxMessage): Promise<SendOutcome> {
  if (await shopStatus(db, message.shopId) !== 'active') return { status: 'skipped', error: 'The shop is not active' }
  const slip = await orderSlip(db, { shopId: message.shopId, orderId: message.orderId })
  if (!slip) return { status: 'skipped', error: 'The order is gone' }
  const png = await renderFilledSlip(db, slip)
  const amount = slip.data.order.amount === null ? '' : ` · ${formatMoney(slip.data.order.amount, slip.data.shop.currency)}`
  const caption = `${slip.data.shop.name} · Order No. ${slip.number}${amount}`
  try {
    await bot.sendPhoto(message.chatId, png, caption)
    return { status: 'sent' }
  }
  catch (error) {
    if (!isTelegramApiError(error)) throw error
    if (isChatGone(error)) return { status: 'skipped', error: error.message, chatGone: true }
    if (error.status === 429 || error.status >= 500) return { status: 'retry', error: error.message, afterMs: error.retryAfterMs }
    return { status: 'failed', error: error.message }
  }
}

/** Sends what's due (one order's, right after a scan; or everything, the every-minute job). */
export function deliverSlips(db: Db, options: { bot: TelegramBot, orderId?: string, now?: Date }): Promise<DeliveryReport> {
  const { bot, orderId, now } = options
  return deliverDue(db, { send: message => sendSlipMessage(db, bot, message), orderId, now })
}
