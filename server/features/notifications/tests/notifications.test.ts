import { eq, isNull } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { deliverDue, linkStatement, purgeNotifications, queueChatMessageStatement } from '#server/features/notifications'
import type { OutboxMessage, SendOutcome } from '#server/features/notifications'
import { notifications, telegramLinks } from '#server/features/notifications/notifications.schema'
import { telegramInvites } from '#server/features/telegram/telegram.schema'
import type { Db } from '#server/utils/batch'
import { createTestDb } from '#server/tests/support/db'
import { createOwner } from '#server/tests/support/auth'
import { createTestOrder, createTestTemplate } from '#server/tests/support/slips'

// The outbox (D28, spec §8.3) and order-only links (plan §8), with a fake sender, two shops apart.

let db: Db
let a: { shopId: string, orderId: string }
let b: { shopId: string, orderId: string }
let sent: OutboxMessage[]
/** What the next sends answer, in turn; `sent` when empty. */
let outcomes: (SendOutcome | Error)[]

async function send(message: OutboxMessage): Promise<SendOutcome> {
  const next = outcomes.shift()
  if (next instanceof Error) throw next
  if (next && next.status !== 'sent') return next
  sent.push(message)
  return { status: 'sent' }
}

async function shopWithOrder() {
  const owner = await createOwner(db)
  const { versionId } = await createTestTemplate(db, owner.userId)
  const { orderId } = await createTestOrder(db, { shopId: owner.shopId, userId: owner.userId, versionId })
  return { shopId: owner.shopId, orderId }
}

beforeEach(async () => {
  db = await createTestDb()
  a = await shopWithOrder()
  b = await shopWithOrder()
  sent = []
  outcomes = []
})

const START = new Date('2026-11-17T03:00:00Z')
const later = (ms: number) => new Date(START.getTime() + ms)
const MINUTE = 60_000

async function link(order: { shopId: string, orderId: string }, chatId = '501', telegramUserId = chatId) {
  await linkStatement(db, { ...order, chatId, telegramUserId }, START)
}

async function queue(order: { shopId: string, orderId: string }, chatId = '501') {
  await queueChatMessageStatement(db, { ...order, chatId, kind: 'slip' }, START)
}

const row = async (orderId: string) => (await db.select().from(notifications).where(eq(notifications.orderId, orderId)))[0]!

describe('the outbox', () => {
  it('sends what is due, once: the same message queued twice is one', async () => {
    await queue(a)
    await queue(a)
    expect(await deliverDue(db, { send, now: START })).toMatchObject({ sent: 1 })
    expect(sent).toEqual([expect.objectContaining({ shopId: a.shopId, orderId: a.orderId, chatId: '501', kind: 'slip', attempt: 1 })])
    expect(await row(a.orderId)).toMatchObject({ status: 'sent', attempts: 1, sentAt: START })
    expect(await deliverDue(db, { send, now: later(MINUTE) })).toMatchObject({ sent: 0 })
  })

  it('a chat that\'s gone skips the message and ends every link to that chat, in every shop', async () => {
    await link(a)
    await link(b)
    await queue(a)
    outcomes = [{ status: 'skipped', error: 'blocked', chatGone: true }]
    await deliverDue(db, { send, now: START })
    expect(await row(a.orderId)).toMatchObject({ status: 'skipped', lastError: 'blocked' })
    expect(await db.select().from(telegramLinks).where(isNull(telegramLinks.revokedAt))).toEqual([])
  })

  it('retries with backoff, the channel\'s wait when it gives one, and gives up after 5 attempts', async () => {
    await queue(a)
    outcomes = [{ status: 'retry', error: 'Too Many Requests', afterMs: 30 * MINUTE }]
    await deliverDue(db, { send, now: START })
    const after = await row(a.orderId)
    expect(after).toMatchObject({ status: 'pending', attempts: 1, lastError: 'Too Many Requests' })
    expect(after.nextAttemptAt.getTime() - START.getTime()).toBe(30 * MINUTE)

    // Not due yet: nothing is tried.
    await deliverDue(db, { send, now: later(MINUTE) })
    expect((await row(a.orderId)).attempts).toBe(1)

    for (let attempt = 2; attempt <= 5; attempt++) {
      outcomes = [new Error('Bad Gateway')]
      await deliverDue(db, { send, now: later(attempt * 24 * 60 * MINUTE) })
    }
    expect(await row(a.orderId)).toMatchObject({ status: 'failed', attempts: 5, lastError: 'Bad Gateway' })
    expect(sent).toEqual([])
  })

  it('a send the channel refuses outright fails at once', async () => {
    await queue(a)
    outcomes = [{ status: 'failed', error: 'Bad Request' }]
    await deliverDue(db, { send, now: START })
    expect(await row(a.orderId)).toMatchObject({ status: 'failed', attempts: 1 })
  })

  it('two overlapping runs send a message once', async () => {
    await queue(a)
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const slow = async (message: OutboxMessage): Promise<SendOutcome> => {
      await gate
      sent.push(message)
      return { status: 'sent' }
    }
    const first = deliverDue(db, { send: slow, now: START })
    const second = deliverDue(db, { send: slow, now: START })
    release()
    await Promise.all([first, second])
    expect(sent).toHaveLength(1)
  })

  it('narrows to one order when asked', async () => {
    await queue(a)
    await queue(b)
    await deliverDue(db, { send, now: START, orderId: b.orderId })
    expect(sent.map(message => message.orderId)).toEqual([b.orderId])
  })

  it('purges settled messages after 90 days, never pending ones', async () => {
    await queue(a)
    await queue(b)
    await deliverDue(db, { send, now: START, orderId: a.orderId })
    await purgeNotifications(db, later(89 * 24 * 60 * MINUTE))
    expect(await db.$count(notifications)).toBe(2)
    await purgeNotifications(db, later(91 * 24 * 60 * MINUTE))
    expect((await db.select({ orderId: notifications.orderId }).from(notifications)).map(entry => entry.orderId)).toEqual([b.orderId])
  })
})

describe('links', () => {
  it('one live link per person and order: a second scan keeps one', async () => {
    await link(a)
    await link(a)
    expect(await db.$count(telegramLinks)).toBe(1)
  })

  it('a revoked link can be made again', async () => {
    await link(a)
    await db.update(telegramLinks).set({ revokedAt: START })
    await link(a)
    expect(await db.$count(telegramLinks, isNull(telegramLinks.revokedAt))).toBe(1)
  })
})

describe('two shops', () => {
  const ids = { id: '01900000-0000-7000-8000-00000000000a', telegramUserId: '1', chatId: '1' }

  it('a link, a message or a QR can\'t pair one shop with another shop\'s order (composite foreign keys)', async () => {
    await expect(db.insert(telegramLinks).values({ ...ids, shopId: b.shopId, orderId: a.orderId })).rejects.toThrow()
    await expect(db.insert(notifications).values({ id: 'slip:x', shopId: b.shopId, orderId: a.orderId, chatId: '1', kind: 'slip', nextAttemptAt: START })).rejects.toThrow()
    await expect(db.insert(telegramInvites).values({ tokenHash: 'h', shopId: b.shopId, orderId: a.orderId, expiresAt: START })).rejects.toThrow()
    // Each shop's own order is fine.
    await db.insert(telegramLinks).values({ ...ids, shopId: a.shopId, orderId: a.orderId })
  })

  it('the same person linked in both shops is two links', async () => {
    await link(a)
    await link(b)
    expect((await db.select({ shopId: telegramLinks.shopId }).from(telegramLinks)).map(entry => entry.shopId).sort()).toEqual([a.shopId, b.shopId].sort())
  })
})
