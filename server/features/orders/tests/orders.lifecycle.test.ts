import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createOrder, getOrder, listOrders, markPaid, markReady, orderOverview, pickUpOrder, reworkOrder, startOrder, cancelOrder } from '#server/features/orders'
import { linkStatement } from '#server/features/notifications'
import { notifications } from '#server/features/notifications/notifications.schema'
import { orders } from '#server/features/orders/orders.schema'
import { deliverSlips } from '#server/features/telegram'
import type { TelegramBot } from '#server/features/telegram'
import type { ShopActor } from '#server/features/identity'
import type { Db } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { createTestDb } from '#server/tests/support/db'
import { createOwner } from '#server/tests/support/auth'
import { attachTestTemplate, counterDesign, createTestTemplate } from '#server/tests/support/slips'

// The work's stages (D39, product notes → order lifecycle): Received → In progress → Ready →
// Collected, rework back to In progress, and "ready for pickup" on Telegram, queued in the same
// batch and taken back by a rework.

let db: Db
let a: ShopActor
let b: ShopActor
let versionId: string

const NOW = new Date('2026-11-18T03:00:00Z')
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000)
const actorOf = (owner: { shopId: string, userId: string }): ShopActor => ({ userId: owner.userId, shopId: owner.shopId, role: 'owner', statements: [] })

beforeEach(async () => {
  db = await createTestDb()
  const ownerA = await createOwner(db, { name: 'Linda Laundry' })
  const ownerB = await createOwner(db)
  a = actorOf(ownerA)
  b = actorOf(ownerB)
  const template = await createTestTemplate(db, ownerA.userId, { design: counterDesign() })
  versionId = template.versionId
  await attachTestTemplate(db, { shopId: a.shopId, templateId: template.templateId })
})

async function newOrder(now = NOW) {
  return (await createOrder(db, a, { input: { templateVersionId: versionId, values: { shirt: 2 }, phone: '', amount: 7000, paid: false }, key: newId(), now })).order
}

function refusal(promise: Promise<unknown>) {
  return promise.then(() => 'allowed', (error: { statusCode?: number, data?: { code?: string } }) => `${error.statusCode} ${error.data?.code}`)
}

const input = (order: { version: number }) => ({ version: order.version })

describe('the stages', () => {
  it('goes Received → In progress → Ready → Collected; rework goes back; each step once', async () => {
    const order = await newOrder()
    expect(order).toMatchObject({ status: 'open', stage: 'received', readyAt: null })
    const started = await startOrder(db, a, { orderId: order.id, input: input(order) })
    expect(started.stage).toBe('in_progress')
    expect(await refusal(startOrder(db, a, { orderId: order.id, input: input(started) }))).toBe('409 INVALID_STATE')
    expect(await refusal(pickUpOrder(db, a, { orderId: order.id, input: input(started) }))).toBe('409 INVALID_STATE')
    const ready = await markReady(db, a, { orderId: order.id, input: input(started), now: at(60) })
    expect(ready).toMatchObject({ stage: 'ready', readyAt: at(60).toISOString() })
    expect(await refusal(markReady(db, a, { orderId: order.id, input: input(ready) }))).toBe('409 INVALID_STATE')
    const reworked = await reworkOrder(db, a, { orderId: order.id, input: input(ready) })
    expect(reworked).toMatchObject({ stage: 'in_progress', readyAt: at(60).toISOString() })
    const readyAgain = await markReady(db, a, { orderId: order.id, input: input(reworked), now: at(90) })
    const collected = await pickUpOrder(db, a, { orderId: order.id, input: input(readyAgain) })
    expect(collected).toMatchObject({ status: 'picked_up', stage: 'ready' })
    expect(await refusal(reworkOrder(db, a, { orderId: order.id, input: input(collected) }))).toBe('409 INVALID_STATE')
  })

  it('marks a received order ready directly', async () => {
    const order = await newOrder()
    expect((await markReady(db, a, { orderId: order.id, input: input(order) })).stage).toBe('ready')
  })

  it('the stage is checked again inside the batch: a pickup never lands on an order sent back to work meanwhile', async () => {
    const order = await markReady(db, a, { orderId: (await newOrder()).id, input: { version: 1 } })
    const racing = new Proxy(db, {
      get(target, key, receiver) {
        if (key === 'batch') {
          return async (statements: unknown) => {
            await target.update(orders).set({ stage: 'in_progress' }).where(eq(orders.id, order.id))
            return target.batch(statements as never)
          }
        }
        return Reflect.get(target, key, receiver)
      },
    })
    expect(await refusal(pickUpOrder(racing, a, { orderId: order.id, input: input(order) }))).toBe('409 VERSION_CONFLICT')
    expect((await getOrder(db, a, order.id)).status).toBe('open')
  })

  it('another shop\'s order answers 404 to every step', async () => {
    const order = await newOrder()
    for (const step of [startOrder, markReady, reworkOrder]) expect(await refusal(step(db, b, { orderId: order.id, input: input(order) }))).toBe('404 NOT_FOUND')
    expect(await getOrder(db, a, order.id)).toEqual(order)
  })
})

describe('"ready for pickup" on Telegram', () => {
  const sent: string[] = []
  const bot: TelegramBot = {
    async sendMessage(chatId, text) {
      sent.push(`${chatId}: ${text}`)
    },
    async sendPhoto(chatId, _photo, caption) {
      sent.push(`${chatId}: [slip] ${caption}`)
    },
  }
  const readyRows = () => db.select({ id: notifications.id, status: notifications.status }).from(notifications).where(eq(notifications.kind, 'ready')).orderBy(notifications.createdAt)

  beforeEach(() => {
    sent.length = 0
  })

  it('is queued for each linked chat with the Ready, taken back by a rework, and queued anew by the next Ready', async () => {
    const order = await newOrder()
    await db.batch([
      linkStatement(db, { shopId: a.shopId, orderId: order.id, telegramUserId: '1', chatId: '11' }, NOW),
      linkStatement(db, { shopId: a.shopId, orderId: order.id, telegramUserId: '2', chatId: '22' }, NOW),
    ])
    const ready = await markReady(db, a, { orderId: order.id, input: input(order), now: at(60) })
    expect((await readyRows()).map(row => row.status)).toEqual(['pending', 'pending'])
    const reworked = await reworkOrder(db, a, { orderId: order.id, input: input(ready) })
    expect((await readyRows()).map(row => row.status)).toEqual(['skipped', 'skipped'])
    await markReady(db, a, { orderId: order.id, input: input(reworked), now: at(90) })
    expect((await readyRows()).filter(row => row.status === 'pending').map(row => row.id).sort())
      .toEqual([`ready:${order.id}:11:${at(90).toISOString()}`, `ready:${order.id}:22:${at(90).toISOString()}`])
    expect(await deliverSlips(db, { bot, now: at(91) })).toMatchObject({ sent: 2 })
    expect(sent.sort()).toEqual(['11: Linda Laundry: your order No. 1 is ready for pickup.', '22: Linda Laundry: your order No. 1 is ready for pickup.'])
  })

  it('is not sent once the order is no longer ready (collected before the send)', async () => {
    const order = await newOrder()
    await db.batch([linkStatement(db, { shopId: a.shopId, orderId: order.id, telegramUserId: '1', chatId: '11' }, NOW)])
    const ready = await markReady(db, a, { orderId: order.id, input: input(order), now: at(60) })
    await pickUpOrder(db, a, { orderId: order.id, input: input(ready) })
    expect(await deliverSlips(db, { bot, now: at(61) })).toMatchObject({ sent: 0, skipped: 1 })
    expect(sent).toEqual([])
  })

  it('a chat that blocked the bot (its link revoked) gets no "ready"', async () => {
    const order = await newOrder()
    await db.batch([linkStatement(db, { shopId: a.shopId, orderId: order.id, telegramUserId: '1', chatId: '11' }, NOW)])
    const { telegramLinks } = await import('#server/features/notifications/notifications.schema')
    await db.update(telegramLinks).set({ revokedAt: NOW })
    await markReady(db, a, { orderId: order.id, input: input(order) })
    expect(await db.$count(notifications)).toBe(0)
  })

  it('a ready order with no linked chat queues nothing', async () => {
    const order = await newOrder()
    await markReady(db, a, { orderId: order.id, input: input(order) })
    expect(await db.$count(notifications)).toBe(0)
  })
})

describe('overview and the state filter', () => {
  it('counts received today, in progress, ready and unpaid (they overlap); the other shop counts its own', async () => {
    const yesterday = await newOrder(new Date('2026-11-17T10:00:00Z'))
    const one = await newOrder()
    const two = await newOrder()
    const three = await newOrder()
    await startOrder(db, a, { orderId: one.id, input: input(one) })
    await markReady(db, a, { orderId: two.id, input: input(two) })
    const paid = await markPaid(db, a, { orderId: three.id, input: input(three), key: newId() })
    await cancelOrder(db, a, { orderId: yesterday.id, input: input(yesterday) })
    expect(await orderOverview(db, a, NOW)).toEqual({ today: '2026-11-18', receivedToday: 3, inProgress: 1, ready: 1, unpaid: 2 })
    expect(await orderOverview(db, b, NOW)).toEqual({ today: '2026-11-18', receivedToday: 0, inProgress: 0, ready: 0, unpaid: 0 })
    const numbers = async (status: Parameters<typeof listOrders>[2]['status']) => (await listOrders(db, a, { page: 1, pageSize: 20, status })).items.map(item => item.number).sort()
    expect(await numbers('received')).toEqual([paid.order.number])
    expect(await numbers('in_progress')).toEqual([one.number])
    expect(await numbers('ready')).toEqual([two.number])
    expect(await numbers('open')).toEqual([one.number, two.number, three.number])
    expect(await numbers('cancelled')).toEqual([yesterday.number])
    await db.update(orders).set({ stage: 'ready' }).where(eq(orders.id, yesterday.id))
    // A cancelled order keeps its stage but is never "ready".
    expect(await numbers('ready')).toEqual([two.number])
  })
})
