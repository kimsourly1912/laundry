import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { blankDesign } from '#shared/contracts/slip-design'
import type { SlipDesign } from '#shared/contracts/slip-design'
import { createElement } from '#shared/slip/elements'
import { listPrices, priceStatus, setPrice } from '#server/features/prices'
import { insertPriceStatement, updatePriceStatement } from '#server/features/prices/prices.repository'
import { priceItems } from '#server/features/prices/prices.schema'
import { createOrder, getOrder } from '#server/features/orders'
import { orderItems } from '#server/features/orders/orders.schema'
import type { ShopActor } from '#server/features/identity'
import type { Db } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { createTestDb } from '#server/tests/support/db'
import { createOwner } from '#server/tests/support/auth'
import { attachTestTemplate, createTestTemplate, publishTestVersion } from '#server/tests/support/slips'

// The shop's prices (D43): the shop's slips decide what is priced, the owner sets how much; the
// server prices an order's counts and weights from them and keeps each line as charged.

let db: Db
let a: ShopActor
let b: ShopActor
let versionId: string
let templateId: string

const NOW = new Date('2026-11-18T03:00:00Z')
const actorOf = (owner: { shopId: string, userId: string }): ShopActor => ({ userId: owner.userId, shopId: owner.shopId, role: 'owner', statements: [] })

/** An itemized slip: shirts and trousers by the piece, washing by the kg, uncharged bags, and the amount. */
function itemizedDesign(): SlipDesign {
  return {
    ...blankDesign(800, 520),
    elements: [
      createElement('orderNo', { id: 'no' }),
      createElement('number', { id: 'shirt' }, { label: 'Shirts', priceKey: 'shirt' }),
      createElement('number', { id: 'trousers' }, { label: 'Pants', priceKey: 'trousers' }),
      createElement('number', { id: 'kg' }, { label: 'Kilo', unit: 'kg', decimals: 2, priceKey: 'wash_kg' }),
      createElement('number', { id: 'bags' }, { label: 'Bags' }),
      createElement('amount', { id: 'total' }),
    ],
    fillOrder: ['shirt', 'trousers', 'kg', 'bags', 'total'],
  }
}

beforeEach(async () => {
  db = await createTestDb()
  const ownerA = await createOwner(db)
  const ownerB = await createOwner(db)
  a = actorOf(ownerA)
  b = actorOf(ownerB)
  const template = await createTestTemplate(db, ownerA.userId, { design: itemizedDesign() })
  versionId = template.versionId
  templateId = template.templateId
  await attachTestTemplate(db, { shopId: a.shopId, templateId })
  await attachTestTemplate(db, { shopId: b.shopId, templateId })
})

function refusal(promise: Promise<unknown>) {
  return promise.then(() => 'allowed', (error: { statusCode?: number, data?: { code?: string } }) => `${error.statusCode} ${error.data?.code}`)
}

async function priceAll(actor: ShopActor) {
  await setPrice(db, actor, 'shirt', { price: 2000, version: null })
  await setPrice(db, actor, 'trousers', { price: 3000, version: null })
  await setPrice(db, actor, 'wash_kg', { price: 3000, version: null })
}

const order = (actor: ShopActor, values: Record<string, number>, amount: number | null, extra: { dueDate?: string } = {}) =>
  createOrder(db, actor, { input: { templateVersionId: versionId, values, phone: '', amount, paid: false, ...extra }, key: newId(), now: NOW })

describe('the shop\'s prices', () => {
  it('lists one row per priced key on the shop\'s slips, named and united by the item list, with no price yet', async () => {
    expect(await listPrices(db, a)).toEqual({
      currency: 'KHR',
      items: [
        { key: 'shirt', label: 'Shirt', unit: 'piece', price: null, version: null, onSlip: true },
        { key: 'trousers', label: 'Trousers', unit: 'piece', price: null, version: null, onSlip: true },
        { key: 'wash_kg', label: 'Wash & fold', unit: 'kg', price: null, version: null, onSlip: true },
      ],
    })
  })

  it('sets a first price, then changes it at the version read; stale or unread versions are 409', async () => {
    expect(await setPrice(db, a, 'shirt', { price: 2000, version: null })).toEqual({ key: 'shirt', label: 'Shirt', unit: 'piece', price: 2000, version: 1, onSlip: true })
    // A second "first" price (another tab) doesn't overwrite it.
    expect(await refusal(setPrice(db, a, 'shirt', { price: 1, version: null }))).toBe('409 VERSION_CONFLICT')
    expect((await setPrice(db, a, 'shirt', { price: 2500, version: 1 })).version).toBe(2)
    expect(await refusal(setPrice(db, a, 'shirt', { price: 1, version: 1 }))).toBe('409 VERSION_CONFLICT')
    expect(await refusal(setPrice(db, a, 'trousers', { price: 1, version: 1 }))).toBe('409 VERSION_CONFLICT')
    expect((await listPrices(db, a)).items[0]).toMatchObject({ key: 'shirt', price: 2500, version: 2 })
  })

  it('refuses a key that isn\'t on the shop\'s slips (404), even one on the item list', async () => {
    expect(await refusal(setPrice(db, a, 'coat', { price: 1000, version: null }))).toBe('404 NOT_FOUND')
    expect(await db.$count(priceItems)).toBe(0)
  })

  it('takes the name and unit from the item list, not from an older row', async () => {
    // A row from before D43, typed by hand and archived.
    await db.batch([insertPriceStatement(db, { id: newId(), shopId: a.shopId, key: 'wash_kg', label: 'Washing', unit: 'piece', price: 1, now: NOW })])
    const [row] = await db.select().from(priceItems).where(eq(priceItems.key, 'wash_kg'))
    await db.batch([updatePriceStatement(db, { shopId: a.shopId, id: row!.id, version: 1, set: { active: false }, now: NOW })])
    expect((await listPrices(db, a)).items[2]).toMatchObject({ key: 'wash_kg', price: null, version: 2 })
    expect(await setPrice(db, a, 'wash_kg', { price: 3000, version: 2 })).toMatchObject({ label: 'Wash & fold', unit: 'kg', price: 3000, version: 3 })
    const [after] = await db.select().from(priceItems).where(eq(priceItems.key, 'wash_kg'))
    expect(after).toMatchObject({ label: 'Wash & fold', unit: 'kg', active: true })
  })

  it('keeps a price whose key left the slips, for old orders, below the slip\'s rows', async () => {
    await priceAll(a)
    await publishTestVersion(db, { templateId, userId: a.userId, number: 2, design: { ...itemizedDesign(), elements: itemizedDesign().elements.filter(element => element.id !== 'trousers'), fillOrder: ['shirt', 'kg', 'bags', 'total'] } })
    const { items } = await listPrices(db, a)
    expect(items.map(item => [item.key, item.onSlip])).toEqual([['shirt', true], ['wash_kg', true], ['trousers', false]])
    expect(await refusal(setPrice(db, a, 'trousers', { price: 1, version: 1 }))).toBe('404 NOT_FOUND')
  })

  it('another shop\'s prices are its own: the same keys, set separately', async () => {
    await priceAll(a)
    expect((await listPrices(db, b)).items.map(item => item.price)).toEqual([null, null, null])
    expect(await setPrice(db, b, 'shirt', { price: 1500, version: null })).toMatchObject({ price: 1500, version: 1 })
    expect((await listPrices(db, a)).items[0]).toMatchObject({ price: 2000 })
    expect((await priceStatus(db, b.shopId))).toEqual({ needed: 3, set: 1 })
  })

  it('tells the platform how many are set, never the amounts; an unknown shop is 404', async () => {
    expect(await priceStatus(db, a.shopId)).toEqual({ needed: 3, set: 0 })
    await setPrice(db, a, 'shirt', { price: 2000, version: null })
    expect(await priceStatus(db, a.shopId)).toEqual({ needed: 3, set: 1 })
    expect(await refusal(priceStatus(db, newId()))).toBe('404 NOT_FOUND')
  })
})

describe('an itemized order', () => {
  beforeEach(() => priceAll(a))

  it('is priced by the server: 2 shirts + 1 trousers = 7,000, lines kept in fill order with the list\'s names', async () => {
    const { order: saved } = await order(a, { trousers: 1, shirt: 2, bags: 3 }, 7000)
    expect(saved.amount).toBe(7000)
    expect(saved.items).toEqual([
      { fieldId: 'shirt', key: 'shirt', label: 'Shirt', unit: 'piece', quantity: 2, unitPrice: 2000, lineTotal: 4000 },
      { fieldId: 'trousers', key: 'trousers', label: 'Trousers', unit: 'piece', quantity: 1, unitPrice: 3000, lineTotal: 3000 },
    ])
  })

  it('weighs in whole grams: 2.50 kg at 3,000 per kg is 7,500', async () => {
    const { order: saved } = await order(a, { kg: 2.5 }, 7500)
    expect(saved.items).toMatchObject([{ unit: 'kg', quantity: 2500, lineTotal: 7500 }])
  })

  it('refuses an amount that isn\'t the total (409 QUOTE_CHANGED), and a count with no price yet or part of a piece (422)', async () => {
    expect(await refusal(order(a, { shirt: 2 }, 3000))).toBe('409 QUOTE_CHANGED')
    expect(await refusal(order(a, { shirt: 1.5 }, 3000))).toBe('422 SLIP_VALUES_INVALID')
    // The other shop has no prices yet: its counts can't be priced.
    expect(await refusal(order(b, { shirt: 1 }, 2000))).toBe('422 SLIP_VALUES_INVALID')
    expect(await db.$count(orderItems)).toBe(0)
  })

  it('keeps what it was charged when a price changes later', async () => {
    const { order: saved } = await order(a, { shirt: 2 }, 4000)
    await setPrice(db, a, 'shirt', { price: 9000, version: 1 })
    expect((await getOrder(db, a, saved.id)).items).toMatchObject([{ label: 'Shirt', unitPrice: 2000, lineTotal: 4000 }])
    expect(await refusal(order(a, { shirt: 2 }, 4000))).toBe('409 QUOTE_CHANGED')
    expect((await order(a, { shirt: 2 }, 18000)).order.amount).toBe(18000)
  })

  it('takes a pickup day from today on, and refuses one before', async () => {
    expect((await order(a, { shirt: 1 }, 2000, { dueDate: '2026-11-20' })).order.dueDate).toBe('2026-11-20')
    expect(await refusal(order(a, { shirt: 1 }, 2000, { dueDate: '2026-11-17' }))).toBe('422 VALIDATION_FAILED')
  })

  it('the lines belong to the order\'s shop', async () => {
    const { order: saved } = await order(a, { shirt: 1 }, 2000)
    expect(await db.select({ shopId: orderItems.shopId }).from(orderItems).where(eq(orderItems.orderId, saved.id))).toEqual([{ shopId: a.shopId }])
  })
})
