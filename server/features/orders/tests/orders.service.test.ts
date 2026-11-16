import * as v from 'valibot'
import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { CreateOrderInput, UpdateOrderInput } from '#shared/contracts/orders'
import { createOrderSchema, updateOrderSchema } from '#shared/contracts/orders'
import { authorizeShop } from '#server/features/identity'
import type { ShopActor } from '#server/features/identity'
import { anonymizeCustomer, createCustomer, listCustomers } from '#server/features/customers'
import { archivePriceItem, createPriceItem, createServiceType, updatePriceItem } from '#server/features/pricing'
import { collectOrder, createOrder, getOrder, getToday, listOrders, recordPayment, transitionOrder, updateOrder } from '#server/features/orders'
import { orderEvents, orderLines, orders } from '#server/features/orders/orders.schema'
import { customers } from '#server/features/customers/customers.schema'
import { auditEvents, idempotencyKeys } from '#server/features/platform/platform.schema'
import { expireIdempotencyKeys } from '#server/features/platform'
import type { Db } from '#server/utils/batch'
import { createTestDb } from '#server/tests/support/db'
import { createOwner } from '#server/tests/support/auth'

// Orders (M2.3) against SQLite built from the migrations, always with two shops.

let db: Db
let a: ShopActor
let b: ShopActor
/** Shop A's price list: a shirt per piece (2,000), mixed clothes per kg (3,000), and shop B's shirt. */
let shirt: string
let kg: string
let otherShopShirt: string
let sokha: string
let washType: string

const actorOf = async (userId: string) => ({ ...await authorizeShop({ db, user: { id: userId, role: 'user' }, permissions: { order: ['create'] } }), requestId: 'req-1' })

async function priceList(actor: ShopActor) {
  const type = await createServiceType(db, actor, { nameEn: 'Wash & iron', nameKm: 'បោក និងអ៊ុត' })
  const piece = await createPriceItem(db, actor, { serviceTypeId: type.id, nameEn: 'Shirt', nameKm: 'អាវ', unit: 'piece', price: 2000 })
  const weight = await createPriceItem(db, actor, { serviceTypeId: type.id, nameEn: 'Mixed clothes', nameKm: null, unit: 'kg', price: 3000 })
  return { piece: piece.id, weight: weight.id, type: type.id }
}

beforeEach(async () => {
  db = await createTestDb()
  a = await actorOf((await createOwner(db)).userId)
  b = await actorOf((await createOwner(db)).userId)
  ;({ piece: shirt, weight: kg, type: washType } = await priceList(a))
  ;({ piece: otherShopShirt } = await priceList(b))
  sokha = (await createCustomer(db, a, { name: 'Sokha', phone: '+85512345678', note: null })).id
})

function refusal(promise: Promise<unknown>) {
  return promise.then(() => 'allowed', (error: { statusCode?: number, data?: { code?: string }, message?: string }) =>
    error.statusCode ? `${error.statusCode} ${error.data?.code}` : `error: ${error.message}`)
}

function fieldErrors(promise: Promise<unknown>) {
  return promise.then(() => undefined, (error: { data?: { fieldErrors?: Record<string, string[]> } }) => Object.keys(error.data?.fieldErrors ?? {}))
}

/** Runs `meanwhile` (another device's write) after the service's reads, right before its batch. */
function beforeNextBatch(meanwhile: () => Promise<unknown>) {
  const realBatch = db.batch.bind(db)
  db.batch = (async (statements: never) => {
    db.batch = realBatch
    await meanwhile()
    return realBatch(statements)
  }) as unknown as Db['batch']
}

let keyCounter = 0
const newKey = () => `0190${String(++keyCounter).padStart(4, '0')}-0000-7000-8000-000000000000`

/** A request's raw body; `customerId` is short for an existing customer. */
type RawCreate = Partial<Omit<CreateOrderInput, 'customer'>> & { customerId?: string, customer?: unknown }

/** As the route receives it: through the contract. */
function createInput(raw: RawCreate = {}): CreateOrderInput {
  const { customerId = sokha, customer, ...rest } = raw
  return v.parse(createOrderSchema, { customer: customer ?? { kind: 'existing', id: customerId }, lines: [{ priceItemId: shirt, quantity: 3 }, { priceItemId: kg, quantity: 2500 }], note: '', paid: false, ...rest })
}
const updateInput = (raw: Omit<UpdateOrderInput, 'note'> & { note?: string }): UpdateOrderInput => v.parse(updateOrderSchema, { note: '', ...raw })

async function newOrder(actor = a, raw: RawCreate = {}) {
  return (await createOrder(db, actor, createInput(raw), newKey())).order
}

describe('create', () => {
  it('numbers per shop, prices the lines from the list, computes the total (2.5 kg rounds to whole riel)', async () => {
    const order = await newOrder()
    expect(order).toMatchObject({ number: 1, status: 'received', paymentStatus: 'unpaid', total: 6000 + 7500, currency: 'KHR', version: 1, paidAt: null })
    expect(order.customer).toEqual({ id: sokha, name: 'Sokha', phone: '+85512345678', anonymized: false })
    expect(order.lines.map(line => [line.itemNameEn, line.serviceNameEn, line.unit, line.quantity, line.unitPrice, line.lineTotal])).toEqual([
      ['Shirt', 'Wash & iron', 'piece', 3, 2000, 6000],
      ['Mixed clothes', 'Wash & iron', 'kg', 2500, 3000, 7500],
    ])
    expect(order.events.map(e => e.type)).toEqual(['created'])
    expect((await newOrder()).number).toBe(2)
    // Another shop counts from 1.
    const bCustomer = await createCustomer(db, b, { name: 'B', phone: null, note: null })
    expect((await newOrder(b, { customerId: bCustomer.id, lines: [{ priceItemId: otherShopShirt, quantity: 1 }] })).number).toBe(1)
  })

  it('rounds a weight line half up to a whole riel', async () => {
    // 1,500 g of a 333-riel-per-kg item: 499.5 → 500. 1,499 g: 499.167 → 499.
    const odd = await createPriceItem(db, a, { serviceTypeId: washType, nameEn: 'Odd', nameKm: null, unit: 'kg', price: 333 })
    expect((await newOrder(a, { lines: [{ priceItemId: odd.id, quantity: 1500 }] })).total).toBe(500)
    expect((await newOrder(a, { lines: [{ priceItemId: odd.id, quantity: 1499 }] })).total).toBe(499)
  })

  it('paid at drop-off: paid now, a payment event', async () => {
    const order = await newOrder(a, { paid: true })
    expect(order).toMatchObject({ paymentStatus: 'paid' })
    expect(order.paidAt).not.toBeNull()
    expect(order.events.map(e => e.type).sort()).toEqual(['created', 'payment_recorded'])
  })

  it('refuses another shop\'s customer, an anonymized one and a missing one the same way', async () => {
    const bCustomer = await createCustomer(db, b, { name: 'B', phone: null, note: null })
    expect(await refusal(newOrder(a, { customerId: bCustomer.id }))).toBe('409 CUSTOMER_UNAVAILABLE')
    await anonymizeCustomer(db, a, sokha, { version: 1 })
    expect(await refusal(newOrder())).toBe('409 CUSTOMER_UNAVAILABLE')
    expect(await refusal(newOrder(a, { customerId: '01900000-0000-7000-8000-000000000000' }))).toBe('409 CUSTOMER_UNAVAILABLE')
    expect(await db.$count(orders)).toBe(0)
  })

  it('refuses another shop\'s price item and an archived one, naming the line', async () => {
    expect(await fieldErrors(newOrder(a, { lines: [{ priceItemId: shirt, quantity: 1 }, { priceItemId: otherShopShirt, quantity: 1 }] }))).toEqual(['lines.1.priceItemId'])
    await archivePriceItem(db, a, kg, 1)
    expect(await refusal(newOrder())).toBe('409 PRICE_ITEM_UNAVAILABLE')
    expect(await db.$count(orders)).toBe(0)
  })

  it('refuses more pieces than a line can hold; grams may go higher', async () => {
    expect(await fieldErrors(newOrder(a, { lines: [{ priceItemId: shirt, quantity: 10_000 }] }))).toEqual(['lines.0.quantity'])
    expect(await refusal(newOrder(a, { lines: [{ priceItemId: kg, quantity: 10_000 }] }))).toBe('allowed')
  })

  it('a price archived between the read and the batch stops the batch: nothing is written', async () => {
    const input = createInput()
    // The batch's guard sees the archive the reads before it missed.
    beforeNextBatch(() => archivePriceItem(db, a, kg, 1))
    expect(await refusal(createOrder(db, a, input, newKey()))).toBe('409 PRICE_ITEM_UNAVAILABLE')
    expect(await db.$count(orders)).toBe(0)
    expect(await db.$count(orderLines)).toBe(0)
  })

  it('a customer anonymized between the read and the batch stops it too', async () => {
    const input = createInput()
    beforeNextBatch(() => anonymizeCustomer(db, a, sokha, { version: 1 }))
    expect(await refusal(createOrder(db, a, input, newKey()))).toBe('409 CUSTOMER_UNAVAILABLE')
    expect(await db.$count(orders)).toBe(0)
  })

  it('two orders at once get different numbers', async () => {
    const [one, two] = await Promise.all([newOrder(), newOrder()])
    expect([one.number, two.number].sort()).toEqual([1, 2])
  })
})

describe('idempotency', () => {
  it('the same key and request answers with the same order and creates nothing more', async () => {
    const key = newKey()
    const first = await createOrder(db, a, createInput(), key)
    const again = await createOrder(db, a, createInput(), key)
    expect(first.replayed).toBe(false)
    expect(again).toMatchObject({ replayed: true, order: { id: first.order.id, number: 1 } })
    expect(await db.$count(orders)).toBe(1)
  })

  it('a double tap (both at once) makes one order', async () => {
    const key = newKey()
    const results = await Promise.all([createOrder(db, a, createInput(), key), createOrder(db, a, createInput(), key)])
    expect(new Set(results.map(r => r.order.id)).size).toBe(1)
    expect(results.map(r => r.replayed).sort()).toEqual([false, true])
    expect(await db.$count(orders)).toBe(1)
  })

  it('the same key used meanwhile (another tab): the batch fails on the key, changes nothing, and replays', async () => {
    const key = newKey()
    let winner = ''
    beforeNextBatch(async () => {
      winner = (await createOrder(db, a, createInput(), key)).order.id
    })
    const late = await createOrder(db, a, createInput(), key)
    expect(late).toMatchObject({ replayed: true, order: { id: winner } })
    expect(await db.$count(orders)).toBe(1)
  })

  it('the same key with another request is 422; another user\'s or shop\'s key is another key', async () => {
    const key = newKey()
    await createOrder(db, a, createInput(), key)
    expect(await refusal(createOrder(db, a, createInput({ note: 'different' }), key))).toBe('422 IDEMPOTENCY_MISMATCH')
    const bCustomer = await createCustomer(db, b, { name: 'B', phone: null, note: null })
    const other = await createOrder(db, b, createInput({ customerId: bCustomer.id, lines: [{ priceItemId: otherShopShirt, quantity: 1 }] }), key)
    expect(other.replayed).toBe(false)
  })

  it('a refused request leaves the key unused: fixed and retried, it runs', async () => {
    const key = newKey()
    expect(await refusal(createOrder(db, a, createInput({ lines: [{ priceItemId: shirt, quantity: 10_000 }] }), key))).toBe('400 VALIDATION_FAILED')
    expect(await db.$count(idempotencyKeys, eq(idempotencyKeys.key, key))).toBe(0)
    expect((await createOrder(db, a, createInput(), key)).replayed).toBe(false)
  })

  it('keys older than a day are purged, newer ones kept', async () => {
    const now = new Date()
    await createOrder(db, a, createInput(), newKey(), new Date(now.getTime() - 25 * 3600_000))
    await createOrder(db, a, createInput(), newKey(), new Date(now.getTime() - 23 * 3600_000))
    await expireIdempotencyKeys(db, now)
    expect(await db.$count(idempotencyKeys)).toBe(1)
  })
})

describe('reads', () => {
  it('another shop\'s order is 404, to read and to change', async () => {
    const order = await newOrder()
    expect(await refusal(getOrder(db, b, order.id))).toBe('404 NOT_FOUND')
    expect(await refusal(transitionOrder(db, b, order.id, { action: 'start', input: { version: 1 } }))).toBe('404 NOT_FOUND')
    expect(await refusal(updateOrder(db, b, order.id, updateInput({ version: 1, lines: [{ priceItemId: otherShopShirt, quantity: 1 }] })))).toBe('404 NOT_FOUND')
    expect(await refusal(recordPayment(db, b, order.id, { version: 1 }, newKey()))).toBe('404 NOT_FOUND')
    expect(await refusal(collectOrder(db, b, order.id, { version: 1, allowUnpaid: true }))).toBe('404 NOT_FOUND')
    expect((await getOrder(db, a, order.id)).version).toBe(1)
  })

  it('lists only the shop\'s orders, newest first, by status, payment and search', async () => {
    const dara = (await createCustomer(db, a, { name: 'Dara Kim', phone: '+85598765432', note: null })).id
    const first = await newOrder()
    const second = await newOrder(a, { customerId: dara, paid: true })
    await transitionOrder(db, a, first.id, { action: 'ready', input: { version: 1 } })
    const bCustomer = await createCustomer(db, b, { name: 'Sokha too', phone: '+85512345678', note: null })
    await newOrder(b, { customerId: bCustomer.id, lines: [{ priceItemId: otherShopShirt, quantity: 1 }] })
    const list = (query: Partial<{ status: 'ready', payment: 'paid', search: string, customerId: string }> = {}) =>
      listOrders(db, a, { page: 1, pageSize: 20, ...query }).then(page => page.items.map(order => order.number))
    expect(await list()).toEqual([2, 1])
    expect(await list({ status: 'ready' })).toEqual([1])
    expect(await list({ payment: 'paid' })).toEqual([2])
    expect(await list({ search: 'dara' })).toEqual([2])
    expect(await list({ search: '098 765' })).toEqual([2])
    expect(await list({ search: '1' })).toEqual([1])
    expect(await list({ search: 'Sokha' })).toEqual([1])
    expect(await list({ customerId: dara })).toEqual([2])
    expect(await list({ customerId: bCustomer.id })).toEqual([])
    expect((await listOrders(db, a, { page: 1, pageSize: 1 })).total).toBe(2)
    expect(second.customer.name).toBe('Dara Kim')
  })

  it('an anonymized customer\'s order stays, shown as anonymized', async () => {
    const order = await newOrder()
    await anonymizeCustomer(db, a, sokha, { version: 1 })
    expect((await getOrder(db, a, order.id)).customer).toMatchObject({ name: '', phone: null, anonymized: true })
  })
})

describe('edit', () => {
  it('keeps a kept line\'s snapshot after a price change, prices new lines now, recomputes the total', async () => {
    const order = await newOrder()
    await updatePriceItem(db, a, shirt, { serviceTypeId: washType, nameEn: 'Shirt', nameKm: null, unit: 'piece', price: 2500, version: 1 })
    const [shirtLine] = order.lines
    const edited = await updateOrder(db, a, order.id, updateInput({ version: 1, lines: [{ lineId: shirtLine!.id, quantity: 4 }, { priceItemId: shirt, quantity: 1 }], note: 'Stain on collar' }))
    expect(edited.lines.map(line => [line.quantity, line.unitPrice, line.lineTotal])).toEqual([[4, 2000, 8000], [1, 2500, 2500]])
    expect(edited).toMatchObject({ total: 10_500, note: 'Stain on collar', version: 2 })
    expect(edited.events[0]).toMatchObject({ type: 'updated', data: { fields: ['lines', 'note'], total: 10_500 } })
  })

  it('a stale version is 409; nothing changes', async () => {
    const order = await newOrder()
    await transitionOrder(db, a, order.id, { action: 'start', input: { version: 1 } })
    expect(await refusal(updateOrder(db, a, order.id, updateInput({ version: 1, lines: [{ priceItemId: shirt, quantity: 1 }] })))).toBe('409 VERSION_CONFLICT')
    expect((await getOrder(db, a, order.id)).lines).toHaveLength(2)
  })

  it('a change made between the read and the batch stops the batch (the version guard)', async () => {
    const order = await newOrder()
    beforeNextBatch(() => transitionOrder(db, a, order.id, { action: 'start', input: { version: 1 } }))
    expect(await refusal(updateOrder(db, a, order.id, updateInput({ version: 1, lines: [{ priceItemId: shirt, quantity: 1 }] })))).toBe('409 VERSION_CONFLICT')
    expect((await getOrder(db, a, order.id)).lines).toHaveLength(2)
  })

  it('a new line\'s price archived between the read and the batch stops it', async () => {
    const order = await newOrder()
    beforeNextBatch(() => archivePriceItem(db, a, kg, 1))
    expect(await refusal(updateOrder(db, a, order.id, updateInput({ version: 1, lines: [{ priceItemId: kg, quantity: 1000 }] })))).toBe('409 PRICE_ITEM_UNAVAILABLE')
    expect((await getOrder(db, a, order.id)).lines).toHaveLength(2)
  })

  it('a payment recorded between the read and the batch stops a line change (the version guard)', async () => {
    const order = await newOrder()
    beforeNextBatch(() => recordPayment(db, a, order.id, { version: 1 }, newKey()))
    expect(await refusal(updateOrder(db, a, order.id, updateInput({ version: 1, lines: [{ priceItemId: shirt, quantity: 1 }] })))).toBe('409 VERSION_CONFLICT')
  })

  it('only while received or in progress', async () => {
    const order = await newOrder()
    const ready = await transitionOrder(db, a, order.id, { action: 'ready', input: { version: 1 } })
    expect(await refusal(updateOrder(db, a, order.id, updateInput({ version: ready.version, lines: [{ priceItemId: shirt, quantity: 1 }] })))).toBe('409 INVALID_STATE')
  })

  it('a paid order may change its note, not its lines', async () => {
    const order = await newOrder(a, { paid: true })
    const kept = order.lines.map(line => ({ lineId: line.id, quantity: line.quantity }))
    expect(await refusal(updateOrder(db, a, order.id, updateInput({ version: 1, lines: [kept[0]!] })))).toBe('409 ORDER_PAID')
    expect(await refusal(updateOrder(db, a, order.id, updateInput({ version: 1, lines: [{ ...kept[0]!, quantity: 9 }, kept[1]!] })))).toBe('409 ORDER_PAID')
    const noted = await updateOrder(db, a, order.id, updateInput({ version: 1, lines: kept, note: 'Call first' }))
    expect(noted).toMatchObject({ note: 'Call first', total: order.total })
  })

  it('a line id from another order is a field error', async () => {
    const other = await newOrder()
    const order = await newOrder()
    expect(await fieldErrors(updateOrder(db, a, order.id, updateInput({ version: 1, lines: [{ lineId: other.lines[0]!.id, quantity: 1 }] })))).toEqual(['lines.0.lineId'])
  })

  it('never touches another shop\'s lines', async () => {
    const bCustomer = await createCustomer(db, b, { name: 'B', phone: null, note: null })
    const bOrder = await newOrder(b, { customerId: bCustomer.id, lines: [{ priceItemId: otherShopShirt, quantity: 1 }] })
    const order = await newOrder()
    await updateOrder(db, a, order.id, updateInput({ version: 1, lines: [{ priceItemId: shirt, quantity: 1 }] }))
    expect(await db.$count(orderLines, and(eq(orderLines.orderId, bOrder.id)))).toBe(1)
  })
})

describe('state machine', () => {
  it('received → in progress → ready → rework → ready → collected, with events and times', async () => {
    const order = await newOrder(a, { paid: true })
    let current = await transitionOrder(db, a, order.id, { action: 'start', input: { version: order.version } })
    expect(current.status).toBe('in_progress')
    current = await transitionOrder(db, a, order.id, { action: 'ready', input: { version: current.version } })
    expect(current.readyAt).not.toBeNull()
    current = await transitionOrder(db, a, order.id, { action: 'rework', input: { version: current.version } })
    expect(current).toMatchObject({ status: 'in_progress', readyAt: null })
    current = await transitionOrder(db, a, order.id, { action: 'ready', input: { version: current.version } })
    current = await collectOrder(db, a, order.id, { version: current.version, allowUnpaid: false })
    expect(current.status).toBe('collected')
    expect(current.collectedAt).not.toBeNull()
    expect(current.events.map(e => e.type)).toEqual(expect.arrayContaining(['started', 'ready', 'rework', 'collected']))
  })

  it('received → ready directly; any move the machine doesn\'t allow is 409 INVALID_STATE', async () => {
    const order = await newOrder()
    expect(await refusal(transitionOrder(db, a, order.id, { action: 'rework', input: { version: 1 } }))).toBe('409 INVALID_STATE')
    expect(await refusal(collectOrder(db, a, order.id, { version: 1, allowUnpaid: true }))).toBe('409 INVALID_STATE')
    const ready = await transitionOrder(db, a, order.id, { action: 'ready', input: { version: 1 } })
    expect(await refusal(transitionOrder(db, a, order.id, { action: 'start', input: { version: ready.version } }))).toBe('409 INVALID_STATE')
    const cancelled = await transitionOrder(db, a, order.id, { action: 'cancel', input: { version: ready.version } })
    expect(await refusal(transitionOrder(db, a, order.id, { action: 'cancel', input: { version: cancelled.version } }))).toBe('409 INVALID_STATE')
  })

  it('a stale version is 409 VERSION_CONFLICT', async () => {
    const order = await newOrder()
    await transitionOrder(db, a, order.id, { action: 'start', input: { version: 1 } })
    expect(await refusal(transitionOrder(db, a, order.id, { action: 'ready', input: { version: 1 } }))).toBe('409 VERSION_CONFLICT')
  })

  it('two devices at once: one wins, the other gets a conflict', async () => {
    const order = await newOrder()
    const results = await Promise.all([
      refusal(transitionOrder(db, a, order.id, { action: 'start', input: { version: 1 } })),
      refusal(transitionOrder(db, a, order.id, { action: 'ready', input: { version: 1 } })),
    ])
    expect(results.sort()).toEqual(['409 VERSION_CONFLICT', 'allowed'])
  })

  it('a change between the read and the batch stops a collect', async () => {
    const order = await newOrder(a, { paid: true })
    const ready = await transitionOrder(db, a, order.id, { action: 'ready', input: { version: 1 } })
    beforeNextBatch(() => transitionOrder(db, a, order.id, { action: 'rework', input: { version: ready.version } }))
    expect(await refusal(collectOrder(db, a, order.id, { version: ready.version, allowUnpaid: false }))).toBe('409 VERSION_CONFLICT')
    expect((await getOrder(db, a, order.id)).status).toBe('in_progress')
    expect(await db.$count(orderEvents, eq(orderEvents.type, 'collected'))).toBe(0)
  })

  it('collecting an unpaid order needs allowUnpaid', async () => {
    const order = await newOrder()
    const ready = await transitionOrder(db, a, order.id, { action: 'ready', input: { version: 1 } })
    expect(await refusal(collectOrder(db, a, order.id, { version: ready.version, allowUnpaid: false }))).toBe('409 ORDER_UNPAID')
    const collected = await collectOrder(db, a, order.id, { version: ready.version, allowUnpaid: true })
    expect(collected).toMatchObject({ status: 'collected', paymentStatus: 'unpaid' })
    expect(collected.events[0]).toMatchObject({ type: 'collected', data: { unpaid: true } })
  })

  it('cancel is audited in the shop\'s history and notes a payment made before', async () => {
    const order = await newOrder(a, { paid: true })
    await transitionOrder(db, a, order.id, { action: 'cancel', input: { version: 1 } })
    const [row] = await db.select().from(auditEvents).where(eq(auditEvents.targetId, order.id))
    expect(row).toMatchObject({ shopId: a.shopId, actorUserId: a.userId, action: 'order.cancel', requestId: 'req-1', data: { from: 'received', paidBeforeCancel: true } })
    expect(await db.$count(orderEvents, and(eq(orderEvents.orderId, order.id), eq(orderEvents.type, 'cancelled')))).toBe(1)
  })
})

describe('payment', () => {
  it('records the total once, at any status but cancelled; a repeat of the key replays', async () => {
    const order = await newOrder()
    const key = newKey()
    const paid = await recordPayment(db, a, order.id, { version: 1 }, key)
    expect(paid).toMatchObject({ replayed: false, order: { paymentStatus: 'paid', version: 2 } })
    expect(paid.order.events[0]).toMatchObject({ type: 'payment_recorded', data: { amount: order.total, currency: 'KHR' } })
    expect(await recordPayment(db, a, order.id, { version: 1 }, key)).toMatchObject({ replayed: true, order: { version: 2 } })
    expect(await db.$count(orderEvents, eq(orderEvents.type, 'payment_recorded'))).toBe(1)
    expect(await refusal(recordPayment(db, a, order.id, { version: 2 }, newKey()))).toBe('409 ALREADY_PAID')
  })

  it('a collected unpaid order can still be paid; a cancelled one can\'t', async () => {
    const order = await newOrder()
    const ready = await transitionOrder(db, a, order.id, { action: 'ready', input: { version: 1 } })
    const collected = await collectOrder(db, a, order.id, { version: ready.version, allowUnpaid: true })
    expect((await recordPayment(db, a, order.id, { version: collected.version }, newKey())).order.paymentStatus).toBe('paid')
    const other = await newOrder()
    const cancelled = await transitionOrder(db, a, other.id, { action: 'cancel', input: { version: 1 } })
    expect(await refusal(recordPayment(db, a, other.id, { version: cancelled.version }, newKey()))).toBe('409 INVALID_STATE')
  })

  it('a change between the read and the batch stops the payment: nothing recorded', async () => {
    const order = await newOrder()
    beforeNextBatch(() => transitionOrder(db, a, order.id, { action: 'start', input: { version: 1 } }))
    expect(await refusal(recordPayment(db, a, order.id, { version: 1 }, newKey()))).toBe('409 VERSION_CONFLICT')
    expect((await getOrder(db, a, order.id)).paymentStatus).toBe('unpaid')
    expect(await db.$count(orderEvents, eq(orderEvents.type, 'payment_recorded'))).toBe(0)
    expect(await db.$count(idempotencyKeys)).toBe(1)
  })

  it('a double tap with two keys records one payment', async () => {
    const order = await newOrder()
    const results = await Promise.all([refusal(recordPayment(db, a, order.id, { version: 1 }, newKey())), refusal(recordPayment(db, a, order.id, { version: 1 }, newKey()))])
    expect(results.sort()).toEqual(['409 VERSION_CONFLICT', 'allowed'])
    expect(await db.$count(orderEvents, eq(orderEvents.type, 'payment_recorded'))).toBe(1)
  })
})

describe('today', () => {
  it('counts the shop\'s orders by status, unpaid, made and collected since Phnom Penh midnight', async () => {
    // 2026-11-16 08:00 in Phnom Penh is 01:00 UTC; midnight there is 17:00 UTC the day before.
    const now = new Date('2026-11-16T01:00:00Z')
    const yesterday = new Date('2026-11-15T16:59:00Z')
    const old = (await createOrder(db, a, createInput(), newKey(), yesterday)).order
    const fresh = (await createOrder(db, a, createInput({ paid: true }), newKey(), now)).order
    const ready = await transitionOrder(db, a, old.id, { action: 'ready', input: { version: 1 }, now })
    await transitionOrder(db, a, fresh.id, { action: 'start', input: { version: 1 }, now })
    const bCustomer = await createCustomer(db, b, { name: 'B', phone: null, note: null })
    const bOrder = (await createOrder(db, b, createInput({ customerId: bCustomer.id, lines: [{ priceItemId: otherShopShirt, quantity: 1 }] }), newKey(), now)).order
    const bReady = await transitionOrder(db, b, bOrder.id, { action: 'ready', input: { version: 1 }, now })
    const bOther = (await createOrder(db, b, createInput({ customerId: bCustomer.id, lines: [{ priceItemId: otherShopShirt, quantity: 1 }] }), newKey(), now)).order
    await collectOrder(db, b, bOther.id, { version: (await transitionOrder(db, b, bOther.id, { action: 'ready', input: { version: 1 }, now })).version, allowUnpaid: true }, now)
    expect(bReady.status).toBe('ready')
    const today = await getToday(db, a, now)
    expect(today.counts).toEqual({ received: 0, inProgress: 1, ready: 1, unpaid: 1, createdToday: 1, collectedToday: 0 })
    expect(today.ready.map(o => o.id)).toEqual([old.id])
    expect(today.unpaid.map(o => o.id)).toEqual([old.id])
    await collectOrder(db, a, old.id, { version: ready.version, allowUnpaid: true }, now)
    expect((await getToday(db, a, now)).counts).toMatchObject({ ready: 0, collectedToday: 1, unpaid: 1 })
  })
})

describe('the person at the counter (D27)', () => {
  const counter = (phone: string, name = '') => ({ customer: { kind: 'counter', phone, name } })
  const customersOf = (actor: ShopActor) => db.select({ id: customers.id, name: customers.name, phone: customers.phoneE164 }).from(customers).where(eq(customers.shopId, actor.shopId))

  it('a new phone makes the customer with the order, audited; the same phone, typed any way, finds them again', async () => {
    const first = await newOrder(a, counter('097 111 2222', 'Dara'))
    expect(first.customer).toMatchObject({ name: 'Dara', phone: '+855971112222', anonymized: false })
    const [audit] = await db.select().from(auditEvents).where(eq(auditEvents.targetId, first.customer.id))
    expect(audit).toMatchObject({ action: 'customer.create', shopId: a.shopId, data: { via: 'order' } })
    // A name typed for a known phone is ignored: the customer keeps theirs.
    const again = await newOrder(a, counter('+855 97 111 2222', 'Someone else'))
    expect(again.customer).toMatchObject({ id: first.customer.id, name: 'Dara' })
    // An existing customer's phone (Sokha's) finds Sokha.
    expect((await newOrder(a, counter('012 345 678'))).customer.id).toBe(sokha)
    expect(await customersOf(a)).toHaveLength(2)
  })

  it('a phone known in another shop is a new customer here', async () => {
    const order = await newOrder(b, { ...counter('012 345 678'), lines: [{ priceItemId: otherShopShirt, quantity: 1 }] })
    expect(order.customer.id).not.toBe(sokha)
    expect(await customersOf(b)).toEqual([{ id: order.customer.id, name: '', phone: '+85512345678' }])
  })

  it('no phone: a walk-in, a customer of their own each time, not in the customers list', async () => {
    const one = await newOrder(a, { customer: { kind: 'counter', phone: '', name: '' } })
    const two = await newOrder(a, { customer: { kind: 'counter', phone: '', name: '' } })
    const named = await newOrder(a, { customer: { kind: 'counter', phone: '', name: 'Mrs Lim' } })
    expect(one.customer).toMatchObject({ name: '', phone: null, anonymized: false })
    expect(one.customer.id).not.toBe(two.customer.id)
    const listed = (await listCustomers(db, a, { page: 1, pageSize: 20 })).items.map(customer => customer.name)
    expect(listed.sort()).toEqual(['Mrs Lim', 'Sokha'])
    expect(named.customer.name).toBe('Mrs Lim')
  })

  it('a former customer\'s phone (anonymized: freed) makes a new customer', async () => {
    await anonymizeCustomer(db, a, sokha, { version: 1 })
    const order = await newOrder(a, counter('012 345 678', 'New Sokha'))
    expect(order.customer).toMatchObject({ name: 'New Sokha', phone: '+85512345678' })
    expect(order.customer.id).not.toBe(sokha)
  })

  it('the same new phone made by another order meanwhile: this order uses that customer, no duplicate', async () => {
    beforeNextBatch(() => createCustomer(db, a, { name: 'Made meanwhile', phone: '+855971112222', note: null }))
    const order = await newOrder(a, counter('097 111 2222', 'Dara'))
    expect(order.customer.name).toBe('Made meanwhile')
    expect((await customersOf(a)).filter(customer => customer.phone === '+855971112222')).toHaveLength(1)
  })

  it('a customer anonymized between the read and the batch stops the order', async () => {
    beforeNextBatch(() => anonymizeCustomer(db, a, sokha, { version: 1 }))
    expect(await refusal(newOrder(a, counter('012 345 678')))).toBe('409 CUSTOMER_UNAVAILABLE')
    expect(await db.$count(orders)).toBe(0)
  })
})

describe('the board\'s stages (D27)', () => {
  it('waiting is received or in progress; ready; done is collected or cancelled; only the shop\'s', async () => {
    const [received, started, ready, collected, cancelled] = [await newOrder(), await newOrder(), await newOrder(), await newOrder(), await newOrder()]
    await transitionOrder(db, a, started.id, { action: 'start', input: { version: 1 } })
    await transitionOrder(db, a, ready.id, { action: 'ready', input: { version: 1 } })
    await transitionOrder(db, a, collected.id, { action: 'ready', input: { version: 1 } })
    await collectOrder(db, a, collected.id, { version: 2, allowUnpaid: true })
    await transitionOrder(db, a, cancelled.id, { action: 'cancel', input: { version: 1 } })
    await newOrder(b, { customer: { kind: 'counter', phone: '', name: '' }, lines: [{ priceItemId: otherShopShirt, quantity: 1 }] })
    const stage = (name: 'waiting' | 'ready' | 'done') => listOrders(db, a, { page: 1, pageSize: 20, stage: name }).then(page => page.items.map(order => order.number).sort())
    expect(await stage('waiting')).toEqual([received.number, started.number].sort())
    expect(await stage('ready')).toEqual([ready.number])
    expect(await stage('done')).toEqual([collected.number, cancelled.number].sort())
  })
})
