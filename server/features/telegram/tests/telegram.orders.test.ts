import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createOrder } from '#server/features/orders'
import { createOrderInvite, deliverSlips, handleUpdate, sendSlipMessage } from '#server/features/telegram'
import type { TelegramBot } from '#server/features/telegram'
import { orders } from '#server/features/orders/orders.schema'
import { telegramInvites } from '#server/features/telegram/telegram.schema'
import { notifications, telegramLinks } from '#server/features/notifications/notifications.schema'
import { shopSettings } from '#server/features/shops/shops.schema'
import type { ShopActor } from '#server/features/identity'
import type { Db } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { createTestDb } from '#server/tests/support/db'
import { createOwner } from '#server/tests/support/auth'
import { attachTestTemplate, counterDesign, createTestTemplate } from '#server/tests/support/slips'

// An order's slip on Telegram (plan §3 steps 5–6, step 4): a QR per order, `/start <token>` links
// that chat to that order only and queues the slip; the slip goes as a PNG drawn on the order's
// own version. Repeats are safe; a blocked bot or a suspended shop gets nothing.

let db: Db
let a: ShopActor
let b: ShopActor
let orderId: string
let sent: { chatId: string, photo: Uint8Array, caption: string }[]
let replies: { chatId: string, text: string }[]
let failWith: (Error & { status: number, retryAfterMs?: number }) | undefined

const NOW = new Date('2026-11-18T06:00:00Z')
const actorOf = (owner: { shopId: string, userId: string }): ShopActor => ({ userId: owner.userId, shopId: owner.shopId, role: 'owner', statements: [] })

const bot: TelegramBot = {
  async sendMessage(chatId, text) {
    replies.push({ chatId, text })
  },
  async sendPhoto(chatId, photo, caption) {
    if (failWith) throw failWith
    sent.push({ chatId, photo, caption })
  },
}

beforeEach(async () => {
  db = await createTestDb()
  const ownerA = await createOwner(db, { name: 'Linda Laundry' })
  const ownerB = await createOwner(db, { name: 'Beta Wash' })
  a = actorOf(ownerA)
  b = actorOf(ownerB)
  const template = await createTestTemplate(db, ownerA.userId, { design: counterDesign() })
  await attachTestTemplate(db, { shopId: a.shopId, templateId: template.templateId })
  orderId = (await createOrder(db, a, { input: { templateVersionId: template.versionId, values: { shirt: 2 }, phone: '', amount: 7000, paid: false }, key: newId(), now: NOW })).order.id
  sent = []
  replies = []
  failWith = undefined
})

function refusal(promise: Promise<unknown>) {
  return promise.then(() => 'allowed', (error: { statusCode?: number, data?: { code?: string } }) => `${error.statusCode} ${error.data?.code}`)
}

const start = (text: string, chat = 501, from = 701) => ({ update_id: 1, message: { chat: { id: chat, type: 'private' }, from: { id: from }, text } })
const tokenOf = (url: string) => new URL(url).searchParams.get('start')!

describe('createOrderInvite', () => {
  it('gives a t.me link with a fresh 43-character token, valid a day; stores only its hash', async () => {
    const invite = await createOrderInvite(db, a, { orderId, botUsername: 'laundry_bot', now: NOW })
    expect(invite.url).toMatch(/^https:\/\/t\.me\/laundry_bot\?start=[\w-]{43}$/)
    expect(invite.expiresAt).toBe(new Date(NOW.getTime() + 86_400_000).toISOString())
    expect(invite.messages).toEqual([])
    const [row] = await db.select().from(telegramInvites)
    expect(row!.tokenHash).toMatch(/^[\da-f]{64}$/)
    expect(row!.tokenHash).not.toContain(tokenOf(invite.url))
    const again = await createOrderInvite(db, a, { orderId, botUsername: 'laundry_bot', now: NOW })
    expect(tokenOf(again.url)).not.toBe(tokenOf(invite.url))
  })

  it('refuses another shop\'s order (404), a cancelled one, and a deployment with no bot (409)', async () => {
    expect(await refusal(createOrderInvite(db, b, { orderId, botUsername: 'laundry_bot' }))).toBe('404 NOT_FOUND')
    expect(await refusal(createOrderInvite(db, a, { orderId, botUsername: '' }))).toBe('409 TELEGRAM_NOT_SET_UP')
    await db.update(orders).set({ status: 'cancelled', cancelledAt: NOW }).where(eq(orders.id, orderId))
    expect(await refusal(createOrderInvite(db, a, { orderId, botUsername: 'laundry_bot' }))).toBe('409 INVALID_STATE')
    expect(await db.$count(telegramInvites)).toBe(0)
  })
})

describe('handleUpdate', () => {
  it('links the chat to the token\'s order and queues its slip, once however often Telegram repeats it', async () => {
    const token = tokenOf((await createOrderInvite(db, a, { orderId, botUsername: 'bot', now: NOW })).url)
    expect(await handleUpdate(db, start(`/start ${token}`), { bot, now: NOW })).toEqual({ orderId })
    expect(await handleUpdate(db, start(`/start ${token}`), { bot, now: NOW })).toEqual({ orderId })
    expect(await db.select({ shopId: telegramLinks.shopId, orderId: telegramLinks.orderId, chatId: telegramLinks.chatId }).from(telegramLinks)).toEqual([{ shopId: a.shopId, orderId, chatId: '501' }])
    expect(await db.select({ id: notifications.id, status: notifications.status }).from(notifications)).toEqual([{ id: `slip:${orderId}:501`, status: 'pending' }])
    expect(replies.map(reply => reply.text)).toEqual(['Thank you. Your slip is on its way.', 'Thank you. Your slip is on its way.'])
  })

  it('answers an expired or unknown token and a bare message with a hint, and links nothing', async () => {
    const token = tokenOf((await createOrderInvite(db, a, { orderId, botUsername: 'bot', now: NOW })).url)
    const tomorrow = new Date(NOW.getTime() + 86_400_001)
    expect(await handleUpdate(db, start(`/start ${token}`), { bot, now: tomorrow })).toBeUndefined()
    expect(await handleUpdate(db, start(`/start ${'x'.repeat(43)}`), { bot, now: NOW })).toBeUndefined()
    expect(await handleUpdate(db, start('/start'), { bot, now: NOW })).toBeUndefined()
    expect(await handleUpdate(db, start('hello'), { bot, now: NOW })).toBeUndefined()
    expect(replies.map(reply => reply.text)).toEqual([
      'This QR code has expired. Ask the laundry to show it again.',
      'This QR code has expired. Ask the laundry to show it again.',
      'Scan the QR code at the laundry to get your slip here.',
      'Scan the QR code at the laundry to get your slip here.',
    ])
    expect(await db.$count(telegramLinks)).toBe(0)
  })

  it('ignores groups and bots', async () => {
    const token = tokenOf((await createOrderInvite(db, a, { orderId, botUsername: 'bot', now: NOW })).url)
    expect(await handleUpdate(db, { update_id: 2, message: { chat: { id: -9, type: 'group' }, from: { id: 1 }, text: `/start ${token}` } }, { bot, now: NOW })).toBeUndefined()
    expect(await handleUpdate(db, { update_id: 3, message: { chat: { id: 9, type: 'private' }, from: { id: 9, is_bot: true }, text: `/start ${token}` } }, { bot, now: NOW })).toBeUndefined()
    expect(replies).toEqual([])
  })
})

describe('sending the slip', () => {
  async function queued() {
    const token = tokenOf((await createOrderInvite(db, a, { orderId, botUsername: 'bot', now: NOW })).url)
    await handleUpdate(db, start(`/start ${token}`), { bot, now: NOW })
  }

  it('sends the filled slip as a PNG with the shop, number and amount; the order shows it sent', async () => {
    await queued()
    expect(await deliverSlips(db, { bot, orderId, now: NOW })).toEqual({ sent: 1, retried: 0, skipped: 0, failed: 0 })
    expect(sent).toHaveLength(1)
    expect([...sent[0]!.photo.slice(1, 4)].map(byte => String.fromCharCode(byte)).join('')).toBe('PNG')
    expect(sent[0]).toMatchObject({ chatId: '501', caption: 'Linda Laundry · Slip No. 1 · 7,000៛' })
    const invite = await createOrderInvite(db, a, { orderId, botUsername: 'bot', now: NOW })
    expect(invite.messages).toEqual([{ status: 'sent', createdAt: NOW.toISOString(), sentAt: NOW.toISOString() }])
    // Sent once: a second run has nothing due.
    expect((await deliverSlips(db, { bot, now: NOW })).sent).toBe(0)
  })

  it('a suspended shop sends nothing; a blocked bot ends the chat\'s links; a limit retries; a refusal fails', async () => {
    await queued()
    const message = { id: `slip:${orderId}:501`, shopId: a.shopId, orderId, chatId: '501', kind: 'slip' as const, attempt: 1 }
    await db.update(shopSettings).set({ status: 'suspended' }).where(eq(shopSettings.shopId, a.shopId))
    expect(await sendSlipMessage(db, bot, message)).toMatchObject({ status: 'skipped' })
    await db.update(shopSettings).set({ status: 'active' }).where(eq(shopSettings.shopId, a.shopId))
    failWith = Object.assign(new Error('Too Many Requests'), { status: 429, retryAfterMs: 3000 })
    expect(await sendSlipMessage(db, bot, message)).toEqual({ status: 'retry', error: 'Too Many Requests', afterMs: 3000 })
    failWith = Object.assign(new Error('Bad Request: wrong file'), { status: 400 })
    expect(await sendSlipMessage(db, bot, message)).toEqual({ status: 'failed', error: 'Bad Request: wrong file' })
    failWith = Object.assign(new Error('Forbidden: bot was blocked by the user'), { status: 403 })
    expect(await deliverSlips(db, { bot, now: NOW })).toMatchObject({ skipped: 1 })
    expect((await db.select({ revokedAt: telegramLinks.revokedAt }).from(telegramLinks))[0]!.revokedAt).toEqual(NOW)
    expect(sent).toEqual([])
  })
})

describe('two shops', () => {
  it('a token leads only to its own shop\'s order; another shop can\'t make a QR for it', async () => {
    const token = tokenOf((await createOrderInvite(db, a, { orderId, botUsername: 'bot', now: NOW })).url)
    await handleUpdate(db, start(`/start ${token}`), { bot, now: NOW })
    expect(await db.select({ shopId: notifications.shopId }).from(notifications)).toEqual([{ shopId: a.shopId }])
    expect(await refusal(createOrderInvite(db, b, { orderId, botUsername: 'bot' }))).toBe('404 NOT_FOUND')
  })
})
