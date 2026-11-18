import { beforeEach, describe, expect, it } from 'vitest'
import type { CreateOrderInput } from '#shared/contracts/orders'
import { createOrder, getOrder, listOrders, orderImage } from '#server/features/orders'
import { orderTemplateImage, orderTemplates } from '#server/features/templates'
import type { ShopActor } from '#server/features/identity'
import type { Db } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { createTestDb } from '#server/tests/support/db'
import { createOwner } from '#server/tests/support/auth'
import { attachTestTemplate, counterDesign, createTestTemplate } from '#server/tests/support/slips'

// Two shops (security.md → Tenant isolation): one shop never reads, uses or numbers into another's
// orders or templates; another shop's record answers the same 404 as a missing one.

let db: Db
let a: ShopActor
let b: ShopActor
let templateA: { templateId: string, versionId: string }
let templateB: { templateId: string, versionId: string }

const actorOf = (owner: { shopId: string, userId: string }): ShopActor => ({ userId: owner.userId, shopId: owner.shopId, role: 'owner', statements: [] })

beforeEach(async () => {
  db = await createTestDb()
  const ownerA = await createOwner(db, { name: 'Alpha Wash' })
  const ownerB = await createOwner(db, { name: 'Beta Wash' })
  a = actorOf(ownerA)
  b = actorOf(ownerB)
  templateA = await createTestTemplate(db, ownerA.userId, { design: counterDesign(), name: 'Alpha slip' })
  templateB = await createTestTemplate(db, ownerB.userId, { design: counterDesign(), name: 'Beta slip' })
  await attachTestTemplate(db, { shopId: a.shopId, templateId: templateA.templateId })
  await attachTestTemplate(db, { shopId: b.shopId, templateId: templateB.templateId })
})

const input = (templateVersionId: string): CreateOrderInput => ({ templateVersionId, values: { shirt: 2 }, phone: '', amount: 7000, paid: false })

function refusal(promise: Promise<unknown>) {
  return promise.then(() => 'allowed', (error: { statusCode?: number, data?: { code?: string } }) => `${error.statusCode} ${error.data?.code}`)
}

describe('orders across two shops', () => {
  it('each shop numbers from 1; the same pickup number in two shops is two orders', async () => {
    const one = await createOrder(db, a, { input: input(templateA.versionId), key: newId() })
    const two = await createOrder(db, b, { input: input(templateB.versionId), key: newId() })
    expect([one.order.number, two.order.number]).toEqual([1, 1])
    expect(one.order.id).not.toBe(two.order.id)
  })

  it('another shop\'s order answers 404, its artwork too, and is never listed', async () => {
    const { order } = await createOrder(db, a, { input: input(templateA.versionId), key: newId() })
    expect(await refusal(getOrder(db, b, order.id))).toBe('404 NOT_FOUND')
    expect(await refusal(orderImage(db, b, { orderId: order.id, imageId: newId() }))).toBe('404 NOT_FOUND')
    expect((await listOrders(db, b, { page: 1, pageSize: 20 })).total).toBe(0)
    expect((await listOrders(db, a, { page: 1, pageSize: 20 })).total).toBe(1)
  })

  it('a shop can\'t fill, list or read the artwork of a template attached only to another', async () => {
    expect(await refusal(createOrder(db, b, { input: input(templateA.versionId), key: newId() }))).toBe('404 NOT_FOUND')
    expect((await orderTemplates(db, b)).map(row => row.templateId)).toEqual([templateB.templateId])
    expect(await refusal(orderTemplateImage(db, b, { templateId: templateA.templateId, imageId: newId() }))).toBe('404 NOT_FOUND')
  })

  it('the same idempotency key in two shops is two keys', async () => {
    const key = newId()
    const one = await createOrder(db, a, { input: input(templateA.versionId), key })
    const two = await createOrder(db, b, { input: input(templateB.versionId), key })
    expect([one.replayed, two.replayed]).toEqual([false, false])
    expect(one.order.id).not.toBe(two.order.id)
  })
})
