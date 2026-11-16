import * as v from 'valibot'
import { and, eq, isNull } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createOrderSchema } from '#shared/contracts/orders'
import { authorizeShop } from '#server/features/identity'
import type { ShopActor } from '#server/features/identity'
import { anonymizeCustomer } from '#server/features/customers'
import { createPriceItem, createServiceType } from '#server/features/pricing'
import { collectOrder, createOrder, transitionOrder } from '#server/features/orders'
import { suspendShop } from '#server/features/shops'
import { uploadReceiptBackground } from '#server/features/receipts'
import { pngOf } from '#server/features/receipts/tests/images'
import { createInvite, deliverOutbox, handleUpdate, sendOutboxMessage, webhookSecretMatches } from '#server/features/telegram'
import type { TelegramBot } from '#server/features/telegram'
import type { ReplyMarkup } from '#server/features/telegram/telegram.bot'
import { telegramInvites, telegramPending } from '#server/features/telegram/telegram.schema'
import { notifications, telegramLinks } from '#server/features/notifications/notifications.schema'
import type { Db } from '#server/utils/batch'
import { createTestDb } from '#server/tests/support/db'
import { createOwner, createTestUser } from '#server/tests/support/auth'

// Telegram linking and messages (D28, spec §8.2–§8.3) against SQLite built from the migrations,
// always with two shops, and a fake bot: nothing reaches Telegram.

let db: Db
let a: ShopActor
let b: ShopActor
let shirtA: string
let shirtB: string

interface Sent {
  chatId: string
  text: string
  photo?: boolean
  keyboard?: ReplyMarkup
}
let sent: Sent[]
/** Throws this for the next send, when set. */
let failNext: (Error & { status?: number, retryAfterMs?: number }) | undefined
const bot: TelegramBot = {
  async sendMessage(chatId, text, keyboard) {
    if (failNext) {
      const error = failNext
      failNext = undefined
      throw error
    }
    sent.push({ chatId, text, keyboard })
  },
  async sendPhoto(chatId, _photo, caption) {
    sent.push({ chatId, text: caption, photo: true })
  },
}

const actorOf = async (userId: string) => ({ ...await authorizeShop({ db, user: { id: userId, role: 'user' }, permissions: { order: ['create'] } }), requestId: 'req-1' })

async function shirtOf(actor: ShopActor) {
  const type = await createServiceType(db, actor, { nameEn: 'Wash & iron', nameKm: 'បោកអ៊ុត' })
  return (await createPriceItem(db, actor, { serviceTypeId: type.id, nameEn: 'Shirt', nameKm: 'អាវ', unit: 'piece', price: 2000 })).id
}

beforeEach(async () => {
  db = await createTestDb()
  a = await actorOf((await createOwner(db)).userId)
  b = await actorOf((await createOwner(db)).userId)
  shirtA = await shirtOf(a)
  shirtB = await shirtOf(b)
  sent = []
  failNext = undefined
})

let keys = 0
async function orderIn(actor: ShopActor, phone = '012 345 678') {
  const input = v.parse(createOrderSchema, { customer: { kind: 'counter', phone, name: 'Dara' }, lines: [{ priceItemId: actor === a ? shirtA : shirtB, quantity: 3 }], note: '', paid: false })
  return (await createOrder(db, actor, input, `0190${String(++keys).padStart(4, '0')}-0000-7000-8000-000000000000`)).order
}

const PERSON = 7001
const STRANGER = 7002
const message = (from: number, extra: Record<string, unknown>) => ({ update_id: 1, message: { chat: { id: from, type: 'private' }, from: { id: from }, ...extra } })
const say = (from: number, text: string) => handleUpdate(db, message(from, { text }), { bot })
const share = (from: number, phone: string, userId = from) => handleUpdate(db, message(from, { contact: { phone_number: phone, user_id: userId } }), { bot })
const tokenOf = (url: string) => new URL(url).searchParams.get('start')!

async function scan(actor: ShopActor, orderId: string, from = PERSON) {
  const { url } = await createInvite(db, actor, orderId, { botUsername: 'laundry_bot' })
  await say(from, `/start ${tokenOf(url)}`)
}

const liveLinks = () => db.select({ shopId: telegramLinks.shopId, orderId: telegramLinks.orderId, chatId: telegramLinks.chatId, verified: telegramLinks.verifiedPhone }).from(telegramLinks).where(isNull(telegramLinks.revokedAt))
const queued = () => db.select({ id: notifications.id, kind: notifications.kind, status: notifications.status, attempts: notifications.attempts }).from(notifications)

function refusal(promise: Promise<unknown>) {
  return promise.then(() => 'allowed', (error: { statusCode?: number, data?: { code?: string }, message?: string }) =>
    error.statusCode ? `${error.statusCode} ${error.data?.code}` : `error: ${error.message}`)
}

describe('the QR (createInvite)', () => {
  it('is a t.me link with a fresh token each time; only its hash is stored', async () => {
    const order = await orderIn(a)
    const first = await createInvite(db, a, order.id, { botUsername: 'laundry_bot', now: new Date('2026-11-16T00:00:00Z') })
    const second = await createInvite(db, a, order.id, { botUsername: 'laundry_bot' })
    expect(first.url).toMatch(/^https:\/\/t\.me\/laundry_bot\?start=[\w-]{43}$/)
    expect(first.expiresAt).toBe('2026-11-17T00:00:00.000Z')
    expect(tokenOf(first.url)).not.toBe(tokenOf(second.url))
    const stored = await db.select({ hash: telegramInvites.tokenHash }).from(telegramInvites)
    expect(stored).toHaveLength(2)
    expect(stored.map(row => row.hash)).not.toContain(tokenOf(first.url))
  })

  it('answers 404 for another shop\'s order, and 409 while the bot isn\'t set up', async () => {
    const order = await orderIn(a)
    expect(await refusal(createInvite(db, b, order.id, { botUsername: 'laundry_bot' }))).toBe('404 NOT_FOUND')
    expect(await refusal(createInvite(db, a, order.id, { botUsername: '' }))).toBe('409 TELEGRAM_OFF')
  })
})

describe('linking (spec §8.2)', () => {
  it('the customer\'s own phone links every order: the receipt now, and later orders\' news', async () => {
    const order = await orderIn(a)
    await scan(a, order.id)
    expect(sent.at(-1)!.text).toMatch(/share your phone number/)
    expect(sent.at(-1)!.keyboard).toMatchObject({ keyboard: [[{ request_contact: true }], [{ text: 'Only this order' }]] })

    // Telegram sends the number without the plus.
    await share(PERSON, '85512345678')
    expect(await liveLinks()).toEqual([{ shopId: a.shopId, orderId: null, chatId: String(PERSON), verified: true }])
    expect(sent.slice(-2).map(entry => entry.text)).toEqual([
      expect.stringMatching(/^Done\. You'll get updates about all your orders at /),
      // No receipt design: the receipt as text, with its lines.
      expect.stringMatching(/order #1\nTotal 6,000៛ · not paid yet[\s\S]*3 × Shirt \(Wash & iron\)/),
    ])
    expect(await db.$count(telegramPending)).toBe(0)

    // A later order of the same customer: its news reaches the chat without a new scan.
    const later = await orderIn(a, '+855 12 345 678')
    await transitionOrder(db, a, later.id, { action: 'ready', input: { version: 1 } })
    await deliverOutbox(db, { bot })
    expect(sent.at(-1)).toMatchObject({ chatId: String(PERSON), text: expect.stringMatching(/order #2 is ready to collect\. To pay: 6,000៛\./) })
  })

  it('another number, or "only this order", links this order alone', async () => {
    const first = await orderIn(a)
    await scan(a, first.id)
    await share(PERSON, '+855 99 888 777')
    expect(await liveLinks()).toEqual([{ shopId: a.shopId, orderId: first.id, chatId: String(PERSON), verified: false }])
    expect(sent.at(-2)!.text).toMatch(/updates about order #1 at /)

    const second = await orderIn(a)
    await scan(a, second.id, STRANGER)
    await say(STRANGER, 'Only this order')
    expect((await liveLinks()).filter(link => link.chatId === String(STRANGER))).toEqual([{ shopId: a.shopId, orderId: second.id, chatId: String(STRANGER), verified: false }])

    // An order-only link hears nothing about the customer's other orders.
    await transitionOrder(db, a, second.id, { action: 'ready', input: { version: 1 } })
    await deliverOutbox(db, { bot })
    expect(sent.filter(entry => entry.chatId === String(PERSON) && /is ready to collect/.test(entry.text))).toEqual([])
    expect(sent.filter(entry => entry.chatId === String(STRANGER) && /is ready to collect/.test(entry.text))).toHaveLength(1)
  })

  it('refuses someone else\'s contact card: no link', async () => {
    const order = await orderIn(a)
    await scan(a, order.id, STRANGER)
    await share(STRANGER, '+85512345678', PERSON)
    expect(sent.at(-1)!.text).toBe('Please share your own phone number with the button below.')
    expect(await liveLinks()).toEqual([])
    expect(await db.$count(telegramPending)).toBe(1)
  })

  it('a walk-in has no phone to prove: the scan links the order straight away', async () => {
    const order = await orderIn(a, '')
    await scan(a, order.id)
    expect(await liveLinks()).toEqual([{ shopId: a.shopId, orderId: order.id, chatId: String(PERSON), verified: false }])
    expect(await queued()).toEqual([{ id: `receipt:${order.id}:${PERSON}`, kind: 'receipt', status: 'sent', attempts: 1 }])
  })

  it('with a receipt design, the receipt is the shop\'s slip as a photo, with the summary as its caption', async () => {
    const admin = await createTestUser(db, { role: 'superadmin' })
    await uploadReceiptBackground(db, { userId: admin.userId, shopId: a.shopId }, { bytes: await pngOf(300, 200) })
    const order = await orderIn(a, '')
    await scan(a, order.id)
    expect(sent.at(-1)).toMatchObject({ photo: true, text: expect.stringMatching(/order #1\nTotal 6,000៛ · not paid yet/) })
  })

  it('a second scan by the same person keeps one link and one receipt', async () => {
    const order = await orderIn(a, '')
    await scan(a, order.id)
    await scan(a, order.id)
    expect(await liveLinks()).toHaveLength(1)
    expect(sent.filter(entry => /Total/.test(entry.text))).toHaveLength(1)
  })

  it('says the code is no good when it\'s unknown, expired, or the shop is suspended', async () => {
    const order = await orderIn(a)
    await say(PERSON, `/start ${'x'.repeat(43)}`)
    expect(sent.at(-1)!.text).toMatch(/expired or isn't valid/)

    const { url } = await createInvite(db, a, order.id, { botUsername: 'laundry_bot', now: new Date(Date.now() - 25 * 60 * 60 * 1000) })
    await say(PERSON, `/start ${tokenOf(url)}`)
    expect(sent.at(-1)!.text).toMatch(/expired or isn't valid/)

    const admin = await createTestUser(db, { role: 'superadmin' })
    await suspendShop(db, { userId: admin.userId, platformRole: 'superadmin' }, a.shopId, { version: 1 })
    await scan(a, order.id)
    expect(sent.at(-1)!.text).toMatch(/expired or isn't valid/)
    expect(await db.$count(telegramPending)).toBe(0)
  })

  it('ignores groups and bots; anything else gets the short help', async () => {
    await handleUpdate(db, { update_id: 1, message: { chat: { id: -5, type: 'group' }, from: { id: PERSON }, text: '/start' } }, { bot })
    await handleUpdate(db, { update_id: 1, message: { chat: { id: 9, type: 'private' }, from: { id: 9, is_bot: true }, text: 'hi' } }, { bot })
    expect(sent).toEqual([])
    await say(PERSON, 'hello')
    await share(PERSON, '+85512345678')
    expect(sent.map(entry => entry.text)).toEqual([expect.stringMatching(/Scan the QR code/), expect.stringMatching(/Scan the QR code/)])
  })
})

describe('messages for an order\'s changes', () => {
  async function linkedOrder(actor: ShopActor) {
    const order = await orderIn(actor)
    await scan(actor, order.id)
    await share(PERSON, '+85512345678')
    sent = []
    return order
  }

  it('ready and collected reach the linked chat once each; a ready after a rework is new', async () => {
    const order = await linkedOrder(a)
    await transitionOrder(db, a, order.id, { action: 'ready', input: { version: 1 } })
    await transitionOrder(db, a, order.id, { action: 'rework', input: { version: 2 } })
    await transitionOrder(db, a, order.id, { action: 'ready', input: { version: 3 } })
    await collectOrder(db, a, order.id, { version: 4, allowUnpaid: true })
    await deliverOutbox(db, { bot })
    await deliverOutbox(db, { bot })
    expect(sent.map(entry => entry.text.replace(/^.*?: /, ''))).toEqual([
      'your order #1 is ready to collect. To pay: 6,000៛.',
      'your order #1 is ready to collect. To pay: 6,000៛.',
      'order #1 was collected. Thank you!',
    ])
  })

  it('stay in their shop: a link in shop A hears nothing of shop B\'s orders, even for the same phone and person', async () => {
    await linkedOrder(a)
    const other = await orderIn(b)
    await transitionOrder(db, b, other.id, { action: 'ready', input: { version: 1 } })
    await deliverOutbox(db, { bot })
    expect(sent).toEqual([])
    expect(await db.$count(notifications, eq(notifications.shopId, b.shopId))).toBe(0)
  })

  it('stop when the customer is anonymized', async () => {
    const order = await linkedOrder(a)
    await anonymizeCustomer(db, a, order.customer.id, { version: 1 })
    expect(await liveLinks()).toEqual([])
    await transitionOrder(db, a, order.id, { action: 'ready', input: { version: 1 } })
    await deliverOutbox(db, { bot })
    expect(sent).toEqual([])
  })
})

describe('sending (spec §8.3)', () => {
  async function readyMessage() {
    const order = await orderIn(a)
    await scan(a, order.id)
    await share(PERSON, '+85512345678')
    await transitionOrder(db, a, order.id, { action: 'ready', input: { version: 1 } })
    sent = []
    const [row] = await db.select().from(notifications).where(eq(notifications.kind, 'ready'))
    return { order, row: row! }
  }
  const apiError = (status: number, description: string, retryAfterMs?: number) => Object.assign(new Error(description), { status, retryAfterMs })

  it('a blocked bot skips the message and ends every link to that chat', async () => {
    const { row } = await readyMessage()
    failNext = apiError(403, 'Forbidden: bot was blocked by the user')
    await deliverOutbox(db, { bot })
    expect((await queued()).find(entry => entry.id === row.id)).toMatchObject({ status: 'skipped', attempts: 1 })
    expect(await liveLinks()).toEqual([])
  })

  it('retries with backoff, Telegram\'s wait when it gives one, and gives up after 5 attempts', async () => {
    const { row } = await readyMessage()
    const start = new Date()
    failNext = apiError(429, 'Too Many Requests', 30 * 60_000)
    await deliverOutbox(db, { bot, now: start })
    const [after] = await db.select().from(notifications).where(eq(notifications.id, row.id))
    expect(after).toMatchObject({ status: 'pending', attempts: 1, lastError: 'Too Many Requests' })
    expect(after!.nextAttemptAt.getTime() - start.getTime()).toBe(30 * 60_000)

    // Not due yet: nothing is sent.
    await deliverOutbox(db, { bot, now: new Date(start.getTime() + 60_000) })
    expect(sent).toEqual([])

    for (let attempt = 2; attempt <= 5; attempt++) {
      failNext = apiError(502, 'Bad Gateway')
      await deliverOutbox(db, { bot, now: new Date(start.getTime() + attempt * 24 * 60 * 60_000) })
    }
    expect((await queued()).find(entry => entry.id === row.id)).toMatchObject({ status: 'failed', attempts: 5 })
  })

  it('a request Telegram refuses outright fails at once', async () => {
    const { row } = await readyMessage()
    failNext = apiError(400, 'Bad Request: message text is empty')
    await deliverOutbox(db, { bot })
    expect((await queued()).find(entry => entry.id === row.id)).toMatchObject({ status: 'failed', attempts: 1 })
  })

  it('two overlapping runs send a message once', async () => {
    await readyMessage()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const slowBot: TelegramBot = { ...bot, async sendMessage(chatId, text) {
      await gate
      sent.push({ chatId, text })
    } }
    const first = deliverOutbox(db, { bot: slowBot })
    const second = deliverOutbox(db, { bot: slowBot })
    release()
    await Promise.all([first, second])
    expect(sent).toHaveLength(1)
  })

  it('skips a suspended shop\'s messages', async () => {
    const { row } = await readyMessage()
    const admin = await createTestUser(db, { role: 'superadmin' })
    await suspendShop(db, { userId: admin.userId, platformRole: 'superadmin' }, a.shopId, { version: 1 })
    const outcome = await sendOutboxMessage(db, bot, { id: row.id, shopId: a.shopId, orderId: row.orderId, chatId: row.chatId, kind: 'ready', attempt: 1 })
    expect(outcome.status).toBe('skipped')
    expect(sent).toEqual([])
  })
})

describe('webhookSecretMatches', () => {
  it('needs the exact secret; an unset secret matches nothing', () => {
    expect(webhookSecretMatches('s3cret_value', 's3cret_value')).toBe(true)
    expect(webhookSecretMatches('s3cret_value', 's3cret_valuE')).toBe(false)
    expect(webhookSecretMatches('s3cret_value', 's3cret')).toBe(false)
    expect(webhookSecretMatches('s3cret_value', undefined)).toBe(false)
    expect(webhookSecretMatches('', '')).toBe(false)
  })
})

// Shop B's links are its own: a person linked in both shops is two links.
describe('two shops, one person', () => {
  it('links separately per shop', async () => {
    await scan(a, (await orderIn(a)).id)
    await share(PERSON, '+85512345678')
    await scan(b, (await orderIn(b)).id)
    await share(PERSON, '+85512345678')
    const links = await liveLinks()
    expect(links.map(link => link.shopId).sort()).toEqual([a.shopId, b.shopId].sort())
    expect(await db.$count(telegramLinks, and(eq(telegramLinks.shopId, b.shopId), isNull(telegramLinks.orderId)))).toBe(1)
  })
})
