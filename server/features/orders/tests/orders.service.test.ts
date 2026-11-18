import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { blankDesign } from '#shared/contracts/slip-design'
import type { CreateOrderInput } from '#shared/contracts/orders'
import { SAMPLE_SHOP } from '#shared/slip/fields'
import { createOrder, getOrder, listOrders, orderImage } from '#server/features/orders'
import { orderTemplates, uploadImage } from '#server/features/templates'
import { renderSlipPng } from '#server/features/templates/templates.render'
import { templates, templateShops } from '#server/features/templates/templates.schema'
import { orders } from '#server/features/orders/orders.schema'
import { shopSettings } from '#server/features/shops/shops.schema'
import { auditEvents, idempotencyKeys } from '#server/features/platform/platform.schema'
import type { PlatformActor, ShopActor } from '#server/features/identity'
import type { Db } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { createTestDb } from '#server/tests/support/db'
import { createOwner, createTestUser } from '#server/tests/support/auth'
import { attachTestTemplate, counterDesign, createTestTemplate, publishTestVersion } from '#server/tests/support/slips'

// Saving a filled slip as an order (plan §3 steps 4–5, §4, §6.8): the server numbers it, dates it,
// pins its template version and checks every value; a double tap or a retry makes one order.

let db: Db
let owner: { shopId: string, userId: string }
let actor: ShopActor
let template: { templateId: string, versionId: string }

const NOW = new Date('2026-11-18T03:30:00Z') // 10:30 in Phnom Penh

beforeEach(async () => {
  db = await createTestDb()
  owner = await createOwner(db, { name: 'Linda Laundry' })
  await db.update(shopSettings).set({ phone: '012 345 678', currency: 'KHR' }).where(eq(shopSettings.shopId, owner.shopId))
  actor = { userId: owner.userId, shopId: owner.shopId, role: 'owner', statements: [], requestId: 'req-1' }
  template = await createTestTemplate(db, owner.userId, { design: counterDesign(), name: 'Linda slip' })
  await attachTestTemplate(db, { shopId: owner.shopId, templateId: template.templateId, isDefault: true })
})

function input(extra: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return { templateVersionId: template.versionId, values: { name: 'Dara', shirt: 2, pants: 1, svc: 'wash' }, phone: '012 345 678', amount: 7000, paid: false, ...extra }
}

function refusal(promise: Promise<unknown>) {
  return promise.then(() => 'allowed', (error: { statusCode?: number, data?: { code?: string, fieldErrors?: unknown }, message?: string }) =>
    error.statusCode ? `${error.statusCode} ${error.data?.code}` : `error: ${error.message}`)
}

const create = (extra: Partial<CreateOrderInput> = {}, key: string = newId()) => createOrder(db, actor, { input: input(extra), key, now: NOW })

describe('createOrder', () => {
  it('numbers, dates and pins the order; stores only the version\'s values; copies the shop', async () => {
    const { order, replayed } = await create({ values: { name: 'Dara', shirt: 2, pants: 1, svc: 'wash' }, paid: true })
    expect(replayed).toBe(false)
    expect(order).toMatchObject({
      number: 1,
      date: '2026-11-18',
      templateVersionId: template.versionId,
      templateVersionNumber: 1,
      templateName: 'Linda slip',
      values: { name: 'Dara', shirt: 2, pants: 1, svc: 'wash' },
      phone: '+85512345678',
      amount: 7000,
      currency: 'KHR',
      paid: true,
      paidAt: NOW.toISOString(),
      status: 'open',
      version: 1,
      shop: { name: 'Linda Laundry', phone: '012 345 678', address: null, logoImageId: null, currency: 'KHR' },
    })
    expect(order.design).toEqual(counterDesign())
    expect((await create()).order.number).toBe(2)
    const audit = await db.select().from(auditEvents).where(eq(auditEvents.targetId, order.id))
    expect(audit).toMatchObject([{ action: 'order.create', shopId: owner.shopId, actorUserId: owner.userId, requestId: 'req-1' }])
  })

  it('leaves out empty text and unticked boxes; an empty phone is none', async () => {
    const { order } = await create({ values: { shirt: 1, name: '' }, phone: '', amount: null })
    expect(order).toMatchObject({ values: { shirt: 1 }, phone: null, amount: null, paid: false, paidAt: null })
  })

  it('a retry with the same key answers with the first order, and makes no other', async () => {
    const key = newId()
    const first = await create({}, key)
    const again = await create({}, key)
    expect(again.replayed).toBe(true)
    expect(again.order).toEqual(first.order)
    expect(await db.$count(orders)).toBe(1)
  })

  it('a double tap (two at once, one key) makes one order and one number', async () => {
    const key = newId()
    const [one, two] = await Promise.all([create({}, key), create({}, key)])
    expect(one.order.id).toBe(two.order.id)
    expect([one.replayed, two.replayed].sort()).toEqual([false, true])
    expect(await db.$count(orders)).toBe(1)
    expect((await create()).order.number).toBe(2)
  })

  it('the same key with other details is refused (422), and changes nothing', async () => {
    const key = newId()
    await create({}, key)
    expect(await refusal(create({ amount: 9000 }, key))).toBe('422 IDEMPOTENCY_MISMATCH')
    expect(await db.$count(orders)).toBe(1)
  })

  it('refuses values that don\'t fit the version, by field, and stores nothing (the key stays usable)', async () => {
    const key = newId()
    const error = await create({ values: { shirt: 1000, svc: 'dry', extra: 1 }, phone: '12', amount: 7000 }, key).catch((e: { statusCode: number, data: unknown }) => e)
    expect(error).toMatchObject({
      statusCode: 422,
      data: {
        code: 'SLIP_VALUES_INVALID',
        fieldErrors: { 'values.shirt': ['From 0 to 999'], 'values.svc': ['Not a value of this slip'], 'values.extra': ['Not a value of this slip'], 'phone': ['Not a valid phone number'] },
      },
    })
    expect(await refusal(create({ values: {} }, key))).toBe('422 SLIP_VALUES_INVALID') // Shirt is required
    expect(await db.$count(orders)).toBe(0)
    expect(await db.$count(idempotencyKeys)).toBe(0)
    expect((await create({}, key)).order.number).toBe(1)
  })

  it('refuses a template that isn\'t attached, was detached or archived (404)', async () => {
    const other = await createTestTemplate(db, owner.userId, { design: counterDesign() })
    expect(await refusal(create({ templateVersionId: other.versionId }))).toBe('404 NOT_FOUND')
    expect(await refusal(create({ templateVersionId: newId() }))).toBe('404 NOT_FOUND')
    await db.update(templates).set({ status: 'archived' }).where(eq(templates.id, template.templateId))
    expect(await refusal(create())).toBe('404 NOT_FOUND')
    await db.update(templates).set({ status: 'published' }).where(eq(templates.id, template.templateId))
    await db.delete(templateShops).where(and(eq(templateShops.shopId, owner.shopId), eq(templateShops.templateId, template.templateId)))
    expect(await refusal(create())).toBe('404 NOT_FOUND')
    expect(await db.$count(orders)).toBe(0)
  })

  it('refuses a version the platform has published past (409 TEMPLATE_CHANGED); the new one is accepted', async () => {
    const { versionId } = await publishTestVersion(db, { ...template, userId: owner.userId, number: 2, design: counterDesign() })
    expect(await refusal(create())).toBe('409 TEMPLATE_CHANGED')
    expect((await create({ templateVersionId: versionId })).order.templateVersionNumber).toBe(2)
  })

  it('stops the batch when the template changes between the check and the write', async () => {
    // Publish again, or detach, just as the order's batch runs: its guards must stop it.
    for (const change of [
      () => publishTestVersion(db, { ...template, userId: owner.userId, number: 2, design: counterDesign() }),
      () => db.delete(templateShops).where(eq(templateShops.templateId, template.templateId)),
    ]) {
      const racing = new Proxy(db, {
        get(target, key, receiver) {
          if (key === 'batch') {
            return async (statements: unknown) => {
              await change()
              return target.batch(statements as never)
            }
          }
          return Reflect.get(target, key, receiver)
        },
      })
      expect(await refusal(createOrder(racing, actor, { input: input(), key: newId(), now: NOW }))).toBe('409 TEMPLATE_CHANGED')
      expect(await db.$count(orders)).toBe(0)
      db = await createTestDb()
      owner = await createOwner(db)
      actor = { ...actor, userId: owner.userId, shopId: owner.shopId }
      template = await createTestTemplate(db, owner.userId, { design: counterDesign() })
      await attachTestTemplate(db, { shopId: owner.shopId, templateId: template.templateId })
    }
  })

  it('a retry after the platform published again still answers with the saved order', async () => {
    const key = newId()
    const first = await create({}, key)
    await publishTestVersion(db, { ...template, userId: owner.userId, number: 2, design: counterDesign() })
    const again = await create({}, key)
    expect(again).toMatchObject({ replayed: true, order: { id: first.order.id, templateVersionNumber: 1 } })
  })
})

describe('getOrder (the reprint)', () => {
  it('keeps the number, the version and the shop copy it was saved with', async () => {
    const { order } = await create()
    const changed = { ...counterDesign(), width: 900 }
    await publishTestVersion(db, { ...template, userId: owner.userId, number: 2, design: changed })
    await db.update(shopSettings).set({ phone: '099 999 999', currency: 'USD' }).where(eq(shopSettings.shopId, owner.shopId))
    const reopened = await getOrder(db, actor, order.id)
    expect(reopened).toEqual(order)
    expect(reopened.design.width).toBe(800)
  })

  it('answers 404 for no such order', async () => {
    expect(await refusal(getOrder(db, actor, newId()))).toBe('404 NOT_FOUND')
  })
})

describe('listOrders', () => {
  it('newest first, a page at a time', async () => {
    for (let i = 0; i < 3; i++) await createOrder(db, actor, { input: input(), key: newId(), now: new Date(NOW.getTime() + i * 1000) })
    const page = await listOrders(db, actor, { page: 1, pageSize: 2 })
    expect(page.items.map(item => item.number)).toEqual([3, 2])
    expect(page).toMatchObject({ total: 3, page: 1, pageSize: 2 })
    expect(page.items[0]).toEqual({ id: page.items[0]!.id, number: 3, date: '2026-11-18', phone: '+85512345678', amount: 7000, currency: 'KHR', paid: false, status: 'open', createdAt: new Date(NOW.getTime() + 2000).toISOString() })
  })
})

describe('listOrders search and filters', () => {
  it('finds by exact number or phone, and filters by status and paid', async () => {
    const one = (await create({ phone: '012 345 678', paid: true })).order
    const two = (await create({ phone: '099 888 777' })).order
    const three = (await create({ phone: '012 345 678' })).order
    await db.update(orders).set({ status: 'cancelled', cancelledAt: NOW }).where(eq(orders.id, three.id))
    const numbers = async (query: Partial<Parameters<typeof listOrders>[2]>) => (await listOrders(db, actor, { page: 1, pageSize: 20, ...query })).items.map(item => item.number)
    expect(await numbers({ search: '2' })).toEqual([two.number])
    expect(await numbers({ search: '#1' })).toEqual([one.number])
    expect(await numbers({ search: '012345678' })).toEqual([three.number, one.number])
    expect(await numbers({ search: 'Dara' })).toEqual([])
    expect(await numbers({ search: '9' })).toEqual([])
    expect(await numbers({ status: 'cancelled' })).toEqual([three.number])
    expect(await numbers({ paid: true })).toEqual([one.number])
    expect(await numbers({ search: '012 345 678', status: 'open', paid: false })).toEqual([])
  })
})

describe('the slip\'s artwork', () => {
  it('an order and an attached template serve only the images their design draws', async () => {
    const admin = await createTestUser(db, { role: 'superadmin' })
    const platform: PlatformActor = { userId: admin.userId, platformRole: 'superadmin' }
    const empty = { values: {}, order: { number: null, date: null, phone: null, amount: null, paid: null }, shop: SAMPLE_SHOP }
    const upload = async () => (await uploadImage(db, platform, { bytes: await renderSlipPng({ design: blankDesign(800, 520), data: empty, images: new Map() }), name: 'art.png' })).id
    const art = await upload()
    const stranger = await upload()
    const design = { ...counterDesign(), background: { color: '#ffffff', imageId: art } }
    const withArt = await createTestTemplate(db, owner.userId, { design })
    await attachTestTemplate(db, { shopId: owner.shopId, templateId: withArt.templateId })
    const { order } = await create({ templateVersionId: withArt.versionId })
    expect((await orderImage(db, actor, { orderId: order.id, imageId: art })).type).toBe('image/png')
    expect(await refusal(orderImage(db, actor, { orderId: order.id, imageId: stranger }))).toBe('404 NOT_FOUND')
    const { orderTemplateImage } = await import('#server/features/templates')
    expect((await orderTemplateImage(db, actor, { templateId: withArt.templateId, imageId: art })).bytes.byteLength).toBeGreaterThan(0)
    expect(await refusal(orderTemplateImage(db, actor, { templateId: withArt.templateId, imageId: stranger }))).toBe('404 NOT_FOUND')
    // A template with that very artwork, but not attached to this shop: 404.
    const elsewhere = await createTestTemplate(db, owner.userId, { design })
    expect(await refusal(orderTemplateImage(db, actor, { templateId: elsewhere.templateId, imageId: art }))).toBe('404 NOT_FOUND')
  })
})

describe('orderTemplates', () => {
  it('lists the attached, published templates at their latest version, the default marked', async () => {
    const draft = await createTestTemplate(db, owner.userId, { name: 'A draft' })
    await db.update(templates).set({ status: 'draft' }).where(eq(templates.id, draft.templateId))
    await attachTestTemplate(db, { shopId: owner.shopId, templateId: draft.templateId })
    await createTestTemplate(db, owner.userId, { name: 'Not attached' })
    const { versionId } = await publishTestVersion(db, { ...template, userId: owner.userId, number: 2, design: counterDesign() })
    expect(await orderTemplates(db, actor)).toEqual([{ templateId: template.templateId, name: 'Linda slip', isDefault: true, versionId, versionNumber: 2, design: counterDesign() }])
  })
})
