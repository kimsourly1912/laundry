import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createCustomer, getCustomer, listCustomers, updateCustomer } from '#server/features/customers'
import { createOrder, getOrder, listOrders } from '#server/features/orders'
import { customers } from '#server/features/customers/customers.schema'
import { auditEvents } from '#server/features/platform/platform.schema'
import type { ShopActor } from '#server/features/identity'
import type { Db } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { createTestDb } from '#server/tests/support/db'
import { createOwner } from '#server/tests/support/auth'
import { attachTestTemplate, counterDesign, createTestTemplate } from '#server/tests/support/slips'

// The shop's customers (D39): found by phone or name, one per phone in a shop, corrected at the
// version read, named on their orders. Another shop's customer is 404 everywhere.

let db: Db
let a: ShopActor
let b: ShopActor
let versionId: string

const actorOf = (owner: { shopId: string, userId: string }): ShopActor => ({ userId: owner.userId, shopId: owner.shopId, role: 'owner', statements: [], requestId: 'req-c' })

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

function refusal(promise: Promise<unknown>) {
  return promise.then(() => 'allowed', (error: { statusCode?: number, data?: { code?: string } }) => `${error.statusCode} ${error.data?.code}`)
}

const order = (customerId: string | null) => createOrder(db, a, { input: { templateVersionId: versionId, customerId, values: { shirt: 1 }, phone: '', amount: 3000, paid: false }, key: newId() })

describe('customers', () => {
  it('adds one with a phone in E.164; finds by phone (exact) or part of the name', async () => {
    const dara = await createCustomer(db, a, { name: 'Dara', phone: '+85512345678' })
    await createCustomer(db, a, { name: 'Sokha', phone: null })
    expect(dara).toMatchObject({ name: 'Dara', phone: '+85512345678', version: 1 })
    const names = async (search?: string) => (await listCustomers(db, a, { page: 1, pageSize: 20, search })).items.map(item => item.name)
    expect(await names()).toEqual(['Dara', 'Sokha'])
    expect(await names('012 345 678')).toEqual(['Dara'])
    expect(await names('ok')).toEqual(['Sokha'])
    expect(await names('099 999 999')).toEqual([])
    expect(await db.select({ action: auditEvents.action, data: auditEvents.data }).from(auditEvents)).toEqual([{ action: 'customer.create', data: null }, { action: 'customer.create', data: null }])
  })

  it('one customer per phone in a shop; the other shop may have the same phone', async () => {
    await createCustomer(db, a, { name: 'Dara', phone: '+85512345678' })
    expect(await refusal(createCustomer(db, a, { name: 'Other', phone: '+85512345678' }))).toBe('409 PHONE_TAKEN')
    expect((await createCustomer(db, b, { name: 'Dara', phone: '+85512345678' })).name).toBe('Dara')
    // Without a phone, two may share a name.
    await createCustomer(db, a, { name: 'Dara', phone: null })
  })

  it('is corrected at the version read; stale is 409; the audit says which fields, not their values', async () => {
    const dara = await createCustomer(db, a, { name: 'Dara', phone: null })
    const fixed = await updateCustomer(db, a, dara.id, { version: 1, name: 'Dara Sok', phone: '+85512345678' })
    expect(fixed).toMatchObject({ name: 'Dara Sok', phone: '+85512345678', version: 2 })
    expect(await refusal(updateCustomer(db, a, dara.id, { version: 1, name: 'Again', phone: null }))).toBe('409 VERSION_CONFLICT')
    const [audit] = await db.select({ data: auditEvents.data }).from(auditEvents).where(eq(auditEvents.action, 'customer.update'))
    expect(audit).toEqual({ data: { fields: ['name', 'phone'] } })
  })

  it('names the order with the name at saving; their history lists only their orders', async () => {
    const dara = await createCustomer(db, a, { name: 'Dara', phone: null })
    const first = (await order(dara.id)).order
    await order(null)
    expect(first).toMatchObject({ customerId: dara.id, customerName: 'Dara' })
    await updateCustomer(db, a, dara.id, { version: 1, name: 'Dara Sok', phone: null })
    expect((await getOrder(db, a, first.id)).customerName).toBe('Dara')
    const history = await listOrders(db, a, { page: 1, pageSize: 20, customerId: dara.id })
    expect(history.items.map(item => item.id)).toEqual([first.id])
  })
})

describe('two shops', () => {
  it('another shop\'s customer is 404: read, change, list, or put on an order', async () => {
    const dara = await createCustomer(db, a, { name: 'Dara', phone: null })
    expect(await refusal(getCustomer(db, b, dara.id))).toBe('404 NOT_FOUND')
    expect(await refusal(updateCustomer(db, b, dara.id, { version: 1, name: 'X', phone: null }))).toBe('404 NOT_FOUND')
    expect((await listCustomers(db, b, { page: 1, pageSize: 20 })).total).toBe(0)
    const ownerB = await createTestTemplate(db, b.userId, { design: counterDesign() })
    await attachTestTemplate(db, { shopId: b.shopId, templateId: ownerB.templateId })
    expect(await refusal(createOrder(db, b, { input: { templateVersionId: ownerB.versionId, customerId: dara.id, values: { shirt: 1 }, phone: '', amount: null, paid: false }, key: newId() }))).toBe('404 NOT_FOUND')
    expect((await db.select().from(customers)).map(row => row.name)).toEqual(['Dara'])
  })
})
