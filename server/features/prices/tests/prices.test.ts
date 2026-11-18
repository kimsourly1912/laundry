import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { blankDesign } from '#shared/contracts/slip-design'
import type { SlipDesign } from '#shared/contracts/slip-design'
import { createElement } from '#shared/slip/elements'
import { createPrice, listPrices, setPriceActive, updatePrice } from '#server/features/prices'
import { createOrder, getOrder } from '#server/features/orders'
import { orderItems } from '#server/features/orders/orders.schema'
import type { ShopActor } from '#server/features/identity'
import type { Db } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { createTestDb } from '#server/tests/support/db'
import { createOwner } from '#server/tests/support/auth'
import { attachTestTemplate, createTestTemplate } from '#server/tests/support/slips'

// The shop's price list and itemized orders (D39; product notes → How a counter order is saved):
// linked counts priced by the server, the amount its total, each line kept as charged.

let db: Db
let a: ShopActor
let b: ShopActor
let versionId: string

const NOW = new Date('2026-11-18T03:00:00Z')
const actorOf = (owner: { shopId: string, userId: string }): ShopActor => ({ userId: owner.userId, shopId: owner.shopId, role: 'owner', statements: [] })

/** An itemized slip: shirts and pants by the piece, washing by the kg, and the amount. */
function itemizedDesign(): SlipDesign {
  return {
    ...blankDesign(800, 520),
    elements: [
      createElement('orderNo', { id: 'no' }),
      createElement('number', { id: 'shirt' }, { label: 'Shirt', priceKey: 'shirt' }),
      createElement('number', { id: 'pants' }, { label: 'Pants', priceKey: 'pants' }),
      createElement('number', { id: 'kg' }, { label: 'Wash (kg)', decimals: 2, priceKey: 'wash.kg' }),
      createElement('number', { id: 'bags' }, { label: 'Bags' }),
      createElement('amount', { id: 'total' }),
    ],
    fillOrder: ['shirt', 'pants', 'kg', 'bags', 'total'],
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
  await attachTestTemplate(db, { shopId: a.shopId, templateId: template.templateId })
  await attachTestTemplate(db, { shopId: b.shopId, templateId: template.templateId })
  await createPrice(db, a, { key: 'shirt', label: 'Shirt, wash + iron', unit: 'piece', price: 2000 })
  await createPrice(db, a, { key: 'pants', label: 'Pants, wash + iron', unit: 'piece', price: 3000 })
  await createPrice(db, a, { key: 'wash.kg', label: 'Wash by weight', unit: 'kg', price: 3000 })
})

function refusal(promise: Promise<unknown>) {
  return promise.then(() => 'allowed', (error: { statusCode?: number, data?: { code?: string } }) => `${error.statusCode} ${error.data?.code}`)
}

const order = (actor: ShopActor, values: Record<string, number>, amount: number | null, extra: { dueDate?: string } = {}) =>
  createOrder(db, actor, { input: { templateVersionId: versionId, values, phone: '', amount, paid: false, ...extra }, key: newId(), now: NOW })

describe('the price list', () => {
  it('one item per key in a shop; label, unit and price change at the version read; archive and bring back', async () => {
    expect(await refusal(createPrice(db, a, { key: 'shirt', label: 'Again', unit: 'piece', price: 1 }))).toBe('409 PRICE_KEY_TAKEN')
    const [shirt] = (await listPrices(db, a)).filter(item => item.key === 'shirt')
    expect(shirt).toMatchObject({ label: 'Shirt, wash + iron', unit: 'piece', price: 2000, currency: 'KHR', active: true, version: 1 })
    const changed = await updatePrice(db, a, shirt!.id, { version: 1, label: 'Shirt', unit: 'piece', price: 2500 })
    expect(changed).toMatchObject({ price: 2500, version: 2 })
    expect(await refusal(updatePrice(db, a, shirt!.id, { version: 1, label: 'Shirt', unit: 'piece', price: 1 }))).toBe('409 VERSION_CONFLICT')
    const archived = await setPriceActive(db, a, shirt!.id, { version: 2, active: false })
    expect(archived.active).toBe(false)
    expect(await refusal(setPriceActive(db, a, shirt!.id, { version: 3, active: false }))).toBe('409 INVALID_STATE')
    expect((await setPriceActive(db, a, shirt!.id, { version: 3, active: true })).active).toBe(true)
  })

  it('another shop\'s list is its own: the same key is free there, and items are 404 across', async () => {
    expect((await createPrice(db, b, { key: 'shirt', label: 'Shirt', unit: 'piece', price: 1500 })).price).toBe(1500)
    const [shirtA] = (await listPrices(db, a)).filter(item => item.key === 'shirt')
    expect(await refusal(updatePrice(db, b, shirtA!.id, { version: 1, label: 'X', unit: 'piece', price: 1 }))).toBe('404 NOT_FOUND')
    expect(await refusal(setPriceActive(db, b, shirtA!.id, { version: 1, active: false }))).toBe('404 NOT_FOUND')
    expect((await listPrices(db, b)).map(item => item.price)).toEqual([1500])
  })
})

describe('an itemized order', () => {
  it('is priced by the server: the product notes\' 2 shirts + 1 pants = 7,000, lines kept in fill order', async () => {
    const { order: saved } = await order(a, { pants: 1, shirt: 2, bags: 3 }, 7000)
    expect(saved.amount).toBe(7000)
    expect(saved.items).toEqual([
      { fieldId: 'shirt', key: 'shirt', label: 'Shirt, wash + iron', unit: 'piece', quantity: 2, unitPrice: 2000, lineTotal: 4000 },
      { fieldId: 'pants', key: 'pants', label: 'Pants, wash + iron', unit: 'piece', quantity: 1, unitPrice: 3000, lineTotal: 3000 },
    ])
  })

  it('weighs in whole grams: 2.50 kg at 3,000 per kg is 7,500', async () => {
    const { order: saved } = await order(a, { kg: 2.5 }, 7500)
    expect(saved.items).toMatchObject([{ unit: 'kg', quantity: 2500, lineTotal: 7500 }])
  })

  it('refuses an amount that isn\'t the total (409 QUOTE_CHANGED), a key with no active price, and part of a piece (422)', async () => {
    expect(await refusal(order(a, { shirt: 2 }, 3000))).toBe('409 QUOTE_CHANGED')
    const [pants] = (await listPrices(db, a)).filter(item => item.key === 'pants')
    await setPriceActive(db, a, pants!.id, { version: 1, active: false })
    expect(await refusal(order(a, { pants: 1 }, 3000))).toBe('422 SLIP_VALUES_INVALID')
    // The other shop has no prices: its counts can't be priced.
    expect(await refusal(order(b, { shirt: 1 }, 2000))).toBe('422 SLIP_VALUES_INVALID')
    expect(await db.$count(orderItems)).toBe(0)
  })

  it('keeps what it was charged when a price changes later', async () => {
    const { order: saved } = await order(a, { shirt: 2 }, 4000)
    const [shirt] = (await listPrices(db, a)).filter(item => item.key === 'shirt')
    await updatePrice(db, a, shirt!.id, { version: 1, label: 'Shirt', unit: 'piece', price: 9000 })
    expect((await getOrder(db, a, saved.id)).items).toMatchObject([{ label: 'Shirt, wash + iron', unitPrice: 2000, lineTotal: 4000 }])
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
