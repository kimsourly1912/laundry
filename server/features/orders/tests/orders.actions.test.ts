import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { cancelOrder, createOrder, getOrder, markPaid, pickUpOrder } from '#server/features/orders'
import { canDo } from '#server/features/orders/orders.rules'
import { orders } from '#server/features/orders/orders.schema'
import { auditEvents } from '#server/features/platform/platform.schema'
import type { ShopActor } from '#server/features/identity'
import type { Db } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { createTestDb } from '#server/tests/support/db'
import { createOwner } from '#server/tests/support/auth'
import { attachTestTemplate, counterDesign, createTestTemplate } from '#server/tests/support/slips'

// Mark paid, Picked up and Cancel (plan §3 step 7, §4): one action at the version read, only from
// the states that allow it; payment at most once per idempotency key; another shop's order is 404.

let db: Db
let a: ShopActor
let b: ShopActor
let versionId: string

const NOW = new Date('2026-11-18T05:00:00Z')
const actorOf = (owner: { shopId: string, userId: string }): ShopActor => ({ userId: owner.userId, shopId: owner.shopId, role: 'owner', statements: [], requestId: 'req-2' })

beforeEach(async () => {
  db = await createTestDb()
  const ownerA = await createOwner(db)
  const ownerB = await createOwner(db)
  a = actorOf(ownerA)
  b = actorOf(ownerB)
  const template = await createTestTemplate(db, ownerA.userId, { design: counterDesign() })
  versionId = template.versionId
  await attachTestTemplate(db, { shopId: a.shopId, templateId: template.templateId })
})

async function newOrder(paid = false) {
  return (await createOrder(db, a, { input: { templateVersionId: versionId, values: { shirt: 2 }, phone: '', amount: 7000, paid }, key: newId(), now: NOW })).order
}

function refusal(promise: Promise<unknown>) {
  return promise.then(() => 'allowed', (error: { statusCode?: number, data?: { code?: string }, message?: string }) =>
    error.statusCode ? `${error.statusCode} ${error.data?.code}` : `error: ${error.message}`)
}

const later = new Date(NOW.getTime() + 60_000)

describe('canDo (plan §4)', () => {
  it('pays an unpaid open or picked-up order; picks up and cancels only an open one', () => {
    expect(canDo('pay', { status: 'open', paid: false })).toBe(true)
    expect(canDo('pay', { status: 'picked_up', paid: false })).toBe(true)
    expect(canDo('pay', { status: 'open', paid: true })).toBe(false)
    expect(canDo('pay', { status: 'cancelled', paid: false })).toBe(false)
    expect(canDo('pick-up', { status: 'open', paid: false })).toBe(true)
    expect(canDo('pick-up', { status: 'picked_up', paid: true })).toBe(false)
    expect(canDo('cancel', { status: 'open', paid: true })).toBe(true)
    expect(canDo('cancel', { status: 'picked_up', paid: true })).toBe(false)
    expect(canDo('cancel', { status: 'cancelled', paid: false })).toBe(false)
  })
})

describe('markPaid', () => {
  it('marks it paid at the version read, with its time and an audit row', async () => {
    const order = await newOrder()
    const { order: paid, replayed } = await markPaid(db, a, { orderId: order.id, input: { version: order.version }, key: newId(), now: later })
    expect(replayed).toBe(false)
    expect(paid).toMatchObject({ paid: true, paidAt: later.toISOString(), status: 'open', version: order.version + 1 })
    expect(await db.select({ action: auditEvents.action, data: auditEvents.data }).from(auditEvents).where(eq(auditEvents.action, 'order.pay')))
      .toEqual([{ action: 'order.pay', data: { paid: false, status: 'open' } }])
  })

  it('a retry with the same key answers with the order as it is now; a new key on a paid order is 409', async () => {
    const order = await newOrder()
    const key = newId()
    const first = await markPaid(db, a, { orderId: order.id, input: { version: order.version }, key, now: later })
    const again = await markPaid(db, a, { orderId: order.id, input: { version: order.version }, key, now: later })
    expect(again).toMatchObject({ replayed: true, order: { id: order.id, paid: true, version: first.order.version } })
    expect(await refusal(markPaid(db, a, { orderId: order.id, input: { version: first.order.version }, key: newId() }))).toBe('409 INVALID_STATE')
  })

  it('two at once with one key pay once', async () => {
    const order = await newOrder()
    const key = newId()
    const both = await Promise.all([1, 2].map(() => markPaid(db, a, { orderId: order.id, input: { version: order.version }, key, now: later })))
    expect(both.map(item => item.replayed).sort()).toEqual([false, true])
    expect((await getOrder(db, a, order.id)).version).toBe(order.version + 1)
  })

  it('a stale version is 409 VERSION_CONFLICT and changes nothing', async () => {
    const order = await newOrder()
    await db.update(orders).set({ version: order.version + 1 }).where(eq(orders.id, order.id))
    expect(await refusal(markPaid(db, a, { orderId: order.id, input: { version: order.version }, key: newId() }))).toBe('409 VERSION_CONFLICT')
    expect((await getOrder(db, a, order.id)).paid).toBe(false)
  })

  it('pays after an unpaid pickup, never a cancelled order', async () => {
    const one = await newOrder()
    const picked = await pickUpOrder(db, a, { orderId: one.id, input: { version: one.version }, now: later })
    expect((await markPaid(db, a, { orderId: one.id, input: { version: picked.version }, key: newId() })).order).toMatchObject({ paid: true, status: 'picked_up' })
    const two = await newOrder()
    const cancelled = await cancelOrder(db, a, { orderId: two.id, input: { version: two.version } })
    expect(await refusal(markPaid(db, a, { orderId: two.id, input: { version: cancelled.version }, key: newId() }))).toBe('409 INVALID_STATE')
  })
})

describe('pickUpOrder and cancelOrder', () => {
  it('picks up an open order, paid or not, and records whether it was paid', async () => {
    const order = await newOrder()
    const picked = await pickUpOrder(db, a, { orderId: order.id, input: { version: order.version }, now: later })
    expect(picked).toMatchObject({ status: 'picked_up', pickedUpAt: later.toISOString(), paid: false })
    const [audit] = await db.select().from(auditEvents).where(eq(auditEvents.action, 'order.pick-up'))
    expect(audit).toMatchObject({ actorUserId: a.userId, shopId: a.shopId, targetId: order.id, data: { paid: false, status: 'open' } })
    expect(await refusal(pickUpOrder(db, a, { orderId: order.id, input: { version: picked.version } }))).toBe('409 INVALID_STATE')
    expect(await refusal(cancelOrder(db, a, { orderId: order.id, input: { version: picked.version } }))).toBe('409 INVALID_STATE')
  })

  it('cancels an open order and keeps a payment as it was', async () => {
    const order = await newOrder(true)
    const cancelled = await cancelOrder(db, a, { orderId: order.id, input: { version: order.version }, now: later })
    expect(cancelled).toMatchObject({ status: 'cancelled', cancelledAt: later.toISOString(), paid: true })
    expect(await refusal(pickUpOrder(db, a, { orderId: order.id, input: { version: cancelled.version } }))).toBe('409 INVALID_STATE')
    expect(await db.$count(orders)).toBe(1)
  })

  it('a stale version is 409 VERSION_CONFLICT', async () => {
    const order = await newOrder()
    await pickUpOrder(db, a, { orderId: order.id, input: { version: order.version } }).catch(() => {})
    const other = await newOrder()
    await db.update(orders).set({ version: 5 }).where(eq(orders.id, other.id))
    expect(await refusal(cancelOrder(db, a, { orderId: other.id, input: { version: other.version } }))).toBe('409 VERSION_CONFLICT')
    expect(await refusal(pickUpOrder(db, a, { orderId: other.id, input: { version: other.version } }))).toBe('409 VERSION_CONFLICT')
  })

  // Another device changes the order after the read, at the same version (a version bump would be
  // caught by the version guard alone): the state condition inside the batch must stop the action.
  function racing(change: Partial<typeof orders.$inferInsert>, orderId: string): Db {
    return new Proxy(db, {
      get(target, key, receiver) {
        if (key === 'batch') {
          return async (statements: unknown) => {
            await target.update(orders).set(change).where(eq(orders.id, orderId))
            return target.batch(statements as never)
          }
        }
        return Reflect.get(target, key, receiver)
      },
    })
  }

  it('the state is checked again inside the batch: never picked up, paid or cancelled from the wrong state', async () => {
    const one = await newOrder()
    expect(await refusal(pickUpOrder(racing({ status: 'cancelled', cancelledAt: NOW }, one.id), a, { orderId: one.id, input: { version: one.version } }))).toBe('409 VERSION_CONFLICT')
    expect((await getOrder(db, a, one.id)).status).toBe('cancelled')
    const two = await newOrder()
    expect(await refusal(markPaid(racing({ status: 'cancelled', cancelledAt: NOW }, two.id), a, { orderId: two.id, input: { version: two.version }, key: newId() }))).toBe('409 VERSION_CONFLICT')
    expect((await getOrder(db, a, two.id)).paid).toBe(false)
    const three = await newOrder()
    expect(await refusal(cancelOrder(racing({ status: 'picked_up', pickedUpAt: NOW }, three.id), a, { orderId: three.id, input: { version: three.version } }))).toBe('409 VERSION_CONFLICT')
    expect((await getOrder(db, a, three.id)).status).toBe('picked_up')
  })
})

describe('two shops', () => {
  it('another shop\'s order is 404 for every action, and is left as it was', async () => {
    const order = await newOrder()
    const input = { version: order.version }
    expect(await refusal(markPaid(db, b, { orderId: order.id, input, key: newId() }))).toBe('404 NOT_FOUND')
    expect(await refusal(pickUpOrder(db, b, { orderId: order.id, input }))).toBe('404 NOT_FOUND')
    expect(await refusal(cancelOrder(db, b, { orderId: order.id, input }))).toBe('404 NOT_FOUND')
    expect(await getOrder(db, a, order.id)).toEqual(order)
  })
})
