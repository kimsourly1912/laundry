import { beforeEach, describe, expect, it } from 'vitest'
import { blankDesign } from '#shared/contracts/slip-design'
import type { SlipDesign } from '#shared/contracts/slip-design'
import { createElement } from '#shared/slip/elements'
import { createOrder, orderSlipSvg, previewOrderSvg } from '#server/features/orders'
import { setPrice } from '#server/features/prices'
import { createCustomer } from '#server/features/customers'
import type { ShopActor } from '#server/features/identity'
import type { Db } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { createTestDb } from '#server/tests/support/db'
import { createOwner } from '#server/tests/support/auth'
import { attachTestTemplate, createTestTemplate } from '#server/tests/support/slips'

// Orders on an HTML slip (D39): the same order flow, the slip drawn by the server (Satori) for the
// preview, the order page, print and Telegram.

let db: Db
let a: ShopActor
let b: ShopActor
let versionId: string

const actorOf = (owner: { shopId: string, userId: string }): ShopActor => ({ userId: owner.userId, shopId: owner.shopId, role: 'owner', statements: [] })

function htmlDesign(): SlipDesign {
  return {
    ...blankDesign(600, 400),
    elements: [
      createElement('number', { id: 'shirt' }, { label: 'Shirt', priceKey: 'shirt' }),
      createElement('amount', { id: 'total' }),
    ],
    fillOrder: ['shirt', 'total'],
    html: '<div class="flex flex-col p-4"><span>No. {{order.number}}</span><span>{{customer.name}}</span><div>{{order.itemLines}}</div><span>{{order.total}}</span><div>{{order.qrCode}}</div></div>',
  }
}

beforeEach(async () => {
  db = await createTestDb()
  const ownerA = await createOwner(db)
  const ownerB = await createOwner(db)
  a = actorOf(ownerA)
  b = actorOf(ownerB)
  const template = await createTestTemplate(db, ownerA.userId, { design: htmlDesign() })
  versionId = template.versionId
  await attachTestTemplate(db, { shopId: a.shopId, templateId: template.templateId })
  await setPrice(db, a, 'shirt', { price: 2000, version: null })
})

describe('an order on an HTML slip', () => {
  it('saves like any other, and its slip is the server\'s SVG with the QR when the page has its link', async () => {
    const dara = await createCustomer(db, a, { name: 'Dara', phone: null })
    const { order } = await createOrder(db, a, { input: { templateVersionId: versionId, customerId: dara.id, values: { shirt: 2 }, phone: '', amount: 4000, paid: false }, key: newId() })
    expect(order.items).toMatchObject([{ key: 'shirt', quantity: 2, lineTotal: 4000 }])
    const sample = await orderSlipSvg(db, a, { orderId: order.id })
    expect(sample.startsWith('<svg')).toBe(true)
    expect(sample).not.toContain('<image')
    const linked = await orderSlipSvg(db, a, { orderId: order.id, qrUrl: 'https://t.me/laundry_bot?start=abc' })
    expect(linked).toContain('<image')
  })

  it('previews a draft priced from the list, with no number and nothing saved', async () => {
    const svg = await previewOrderSvg(db, a, { templateVersionId: versionId, customerId: null, dueDate: null, values: { shirt: 3 }, phone: '', amount: null, paid: false })
    expect(svg.startsWith('<svg')).toBe(true)
    expect(await db.$count((await import('#server/features/orders/orders.schema')).orders)).toBe(0)
  })

  it('another shop can\'t draw this shop\'s order or preview its slip (404)', async () => {
    const { order } = await createOrder(db, a, { input: { templateVersionId: versionId, values: { shirt: 1 }, phone: '', amount: 2000, paid: false }, key: newId() })
    const refusal = (promise: Promise<unknown>) => promise.then(() => 'allowed', (error: { statusCode?: number }) => error.statusCode)
    expect(await refusal(orderSlipSvg(db, b, { orderId: order.id }))).toBe(404)
    expect(await refusal(previewOrderSvg(db, b, { templateVersionId: versionId, customerId: null, dueDate: null, values: {}, phone: '', amount: null, paid: false }))).toBe(404)
  })
})
