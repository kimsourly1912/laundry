import { asc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { CreateShopInput } from '#shared/contracts/platform-shops'
import type { TemplateDefinition } from '#shared/contracts/templates'
import type { PlatformActor } from '#server/features/identity'
import { archiveServiceType, createServiceType, listPriceItems, listServiceTypes } from '#server/features/pricing'
import { applyTemplate, createShop, getShop, platformShopActor } from '#server/features/shops'
import { archiveTemplate, createTemplate, updateTemplate } from '#server/features/templates'
import { priceItems, serviceTypes } from '#server/features/pricing/pricing.schema'
import { auditEvents } from '#server/features/platform/platform.schema'
import { organization } from '#server/db/tables'
import { shopSettings } from '#server/features/shops/shops.schema'
import type { Db } from '#server/utils/batch'
import { createTestDb } from '#server/tests/support/db'
import { createTestUser } from '#server/tests/support/auth'

// A shop made from a slip template (D25), and the platform keeping a shop's price list (D26),
// against SQLite built from the migrations, always with two shops.

let db: Db
let actor: PlatformActor

beforeEach(async () => {
  db = await createTestDb()
  const admin = await createTestUser(db, { role: 'superadmin' })
  actor = { userId: admin.userId, platformRole: 'superadmin', requestId: 'req-1' }
})

const definition: TemplateDefinition = {
  services: [{ key: 'wash', nameEn: 'Wash & iron', nameKm: 'បោកអ៊ុត' }, { key: 'iron', nameEn: 'Iron only', nameKm: null }],
  items: [
    { key: 'shirt', nameEn: 'Shirt', nameKm: 'អាវ', unit: 'piece' },
    { key: 'pants', nameEn: 'Pants', nameKm: 'ខោ', unit: 'piece' },
    { key: 'kg', nameEn: 'Mixed', nameKm: null, unit: 'kg' },
  ],
  prices: [
    { service: 'wash', item: 'kg', price: 250 },
    { service: 'wash', item: 'shirt', price: 100 },
    { service: 'iron', item: 'pants', price: 50 },
  ],
}

let made = 0
function input(templateId?: string): CreateShopInput {
  const n = ++made
  return { name: `Shop ${n}`, slug: `shop-${n}`, owner: { name: `Owner ${n}`, username: `owner${n}`, password: 'temporary password 1' }, templateId }
}

function refusal(promise: Promise<unknown>) {
  return promise.then(() => 'allowed', (error: { statusCode?: number, data?: { code?: string }, message?: string }) =>
    error.statusCode ? `${error.statusCode} ${error.data?.code}` : `error: ${error.message}`)
}

/** Runs `meanwhile` just before the next batch: a change that lands between a read and the write. */
function beforeNextBatch(meanwhile: () => Promise<unknown>) {
  const realBatch = db.batch.bind(db)
  db.batch = (async (statements: never) => {
    db.batch = realBatch
    await meanwhile()
    return realBatch(statements)
  }) as unknown as Db['batch']
}

const listOf = async (shopId: string) => {
  const scope = await platformShopActor(db, actor, shopId)
  const types = (await listServiceTypes(db, scope, {})).items
  const items = (await listPriceItems(db, scope, {})).items
  return types.map(type => `${type.sort}. ${type.nameEn}: ${items.filter(item => item.serviceTypeId === type.id).map(item => `${item.nameEn} ${item.price}/${item.unit}`).join(', ')}`)
}

describe('createShop from a template (D25)', () => {
  it('gives the shop its own copy of the price list, in slip order, in the template\'s currency', async () => {
    const template = await createTemplate(db, actor, { name: 'Standard', currency: 'USD', definition })
    const shop = await createShop(db, actor, input(template.id))
    expect(shop.currency).toBe('USD')
    // By service in the template's order, each with its priced items in the template's item order.
    expect(await listOf(shop.id)).toEqual(['1. Wash & iron: Shirt 100/piece, Mixed 250/kg', '2. Iron only: Pants 50/piece'])
    const [audit] = await db.select().from(auditEvents).where(eq(auditEvents.targetId, shop.id))
    expect(audit).toMatchObject({ action: 'shop.create', shopId: null, data: { ownerUsername: shop.owner!.username, templateId: template.id } })
  })

  it('gives two shops two separate copies, which a later template change doesn\'t touch', async () => {
    const template = await createTemplate(db, actor, { name: 'Standard', currency: 'KHR', definition })
    const a = await createShop(db, actor, input(template.id))
    const b = await createShop(db, actor, input(template.id))
    const idsOf = async (shopId: string) => (await db.select({ id: priceItems.id }).from(priceItems).where(eq(priceItems.shopId, shopId)).orderBy(asc(priceItems.sort))).map(row => row.id)
    const [idsA, idsB] = [await idsOf(a.id), await idsOf(b.id)]
    expect(idsA).toHaveLength(3)
    expect(idsA.filter(id => idsB.includes(id))).toEqual([])
    // A price list change in one shop stays in that shop.
    await createServiceType(db, await platformShopActor(db, actor, a.id), { nameEn: 'Dry clean', nameKm: null })
    expect(await db.$count(serviceTypes, eq(serviceTypes.shopId, a.id))).toBe(3)
    expect(await db.$count(serviceTypes, eq(serviceTypes.shopId, b.id))).toBe(2)

    await updateTemplate(db, actor, template.id, { version: 1, name: 'Standard', currency: 'KHR', definition: { ...definition, prices: [{ service: 'wash', item: 'shirt', price: 999 }] } })
    expect(await listOf(b.id)).toEqual(['1. Wash & iron: Shirt 100/piece, Mixed 250/kg', '2. Iron only: Pants 50/piece'])
  })

  it('without a template: an empty price list in riel, as before', async () => {
    const shop = await createShop(db, actor, input())
    expect(shop.currency).toBe('KHR')
    expect(await listOf(shop.id)).toEqual([])
  })

  it('refuses an archived template and writes nothing', async () => {
    const template = await createTemplate(db, actor, { name: 'Old', currency: 'KHR', definition })
    await archiveTemplate(db, actor, template.id, { version: 1 })
    expect(await refusal(createShop(db, actor, input(template.id)))).toBe('409 TEMPLATE_UNAVAILABLE')
    expect(await db.$count(organization)).toBe(0)
  })

  it('a template archived between the read and the batch stops the shop too', async () => {
    const template = await createTemplate(db, actor, { name: 'Racing', currency: 'KHR', definition })
    beforeNextBatch(() => archiveTemplate(db, actor, template.id, { version: 1 }))
    expect(await refusal(createShop(db, actor, input(template.id)))).toBe('409 TEMPLATE_UNAVAILABLE')
    expect(await db.$count(organization)).toBe(0)
    expect(await db.$count(serviceTypes)).toBe(0)
  })
})

describe('the platform keeps a shop\'s price list (D26)', () => {
  it('acts in the shop named in the path, audited in that shop\'s history as the admin', async () => {
    const a = await createShop(db, actor, input())
    const b = await createShop(db, actor, input())
    const created = await createServiceType(db, await platformShopActor(db, actor, a.id), { nameEn: 'Wash & iron', nameKm: null })
    expect(await listOf(a.id)).toEqual(['1. Wash & iron: '])
    expect(await listOf(b.id)).toEqual([])
    const [audit] = await db.select().from(auditEvents).where(eq(auditEvents.targetId, created.id))
    expect(audit).toMatchObject({ action: 'service-type.create', shopId: a.id, actorUserId: actor.userId, requestId: 'req-1' })
  })

  it('answers 404 for a shop that doesn\'t exist', async () => {
    expect(await refusal(platformShopActor(db, actor, '01900000-0000-7000-8000-000000000000'))).toBe('404 NOT_FOUND')
  })
})

describe('applyTemplate to an existing shop (D30)', () => {
  it('copies the price list and currency into an empty shop, audited, and leaves the other shop alone', async () => {
    const template = await createTemplate(db, actor, { name: 'Standard', currency: 'USD', definition })
    const a = await createShop(db, actor, input())
    const b = await createShop(db, actor, input())
    expect(a.priceListEmpty).toBe(true)
    const applied = await applyTemplate(db, actor, a.id, { version: a.version, templateId: template.id })
    expect(applied).toMatchObject({ currency: 'USD', priceListEmpty: false, version: a.version + 1 })
    expect(await listOf(a.id)).toEqual(['1. Wash & iron: Shirt 100/piece, Mixed 250/kg', '2. Iron only: Pants 50/piece'])
    expect(await listOf(b.id)).toEqual([])
    expect(await getShop(db, b.id)).toMatchObject({ currency: 'KHR', priceListEmpty: true, version: b.version })
    const audits = await db.select().from(auditEvents).where(eq(auditEvents.targetId, a.id))
    expect(audits.find(row => row.action === 'shop.apply-template')).toMatchObject({ shopId: null, actorUserId: actor.userId, data: { templateId: template.id } })
  })

  it('refuses a shop that has anything in its price list, even one archived service, and writes nothing', async () => {
    const template = await createTemplate(db, actor, { name: 'Standard', currency: 'USD', definition })
    const shop = await createShop(db, actor, input())
    const scope = await platformShopActor(db, actor, shop.id)
    const type = await createServiceType(db, scope, { nameEn: 'Dry clean', nameKm: null })
    await archiveServiceType(db, scope, type.id, type.version)
    expect((await getShop(db, shop.id)).priceListEmpty).toBe(false)
    expect(await refusal(applyTemplate(db, actor, shop.id, { version: shop.version, templateId: template.id }))).toBe('409 PRICE_LIST_NOT_EMPTY')
    expect(await db.$count(priceItems, eq(priceItems.shopId, shop.id))).toBe(0)
    expect((await getShop(db, shop.id)).currency).toBe('KHR')
  })

  it('a price added between the read and the batch stops the copy (the guard is in the batch)', async () => {
    const template = await createTemplate(db, actor, { name: 'Standard', currency: 'USD', definition })
    const shop = await createShop(db, actor, input())
    beforeNextBatch(async () => createServiceType(db, await platformShopActor(db, actor, shop.id), { nameEn: 'Dry clean', nameKm: null }))
    expect(await refusal(applyTemplate(db, actor, shop.id, { version: shop.version, templateId: template.id }))).toBe('409 PRICE_LIST_NOT_EMPTY')
    expect(await listOf(shop.id)).toEqual(['1. Dry clean: '])
  })

  it('refuses a stale version with 409 VERSION_CONFLICT', async () => {
    const template = await createTemplate(db, actor, { name: 'Standard', currency: 'USD', definition })
    const shop = await createShop(db, actor, input())
    expect(await refusal(applyTemplate(db, actor, shop.id, { version: shop.version + 1, templateId: template.id }))).toBe('409 VERSION_CONFLICT')
    expect(await db.$count(serviceTypes, eq(serviceTypes.shopId, shop.id))).toBe(0)
    const [settings] = await db.select({ version: shopSettings.version }).from(shopSettings).where(eq(shopSettings.shopId, shop.id))
    expect(settings?.version).toBe(shop.version)
  })

  it('refuses an archived template, also one archived between the read and the batch', async () => {
    const shop = await createShop(db, actor, input())
    const old = await createTemplate(db, actor, { name: 'Old', currency: 'USD', definition })
    await archiveTemplate(db, actor, old.id, { version: 1 })
    expect(await refusal(applyTemplate(db, actor, shop.id, { version: shop.version, templateId: old.id }))).toBe('409 TEMPLATE_UNAVAILABLE')
    const racing = await createTemplate(db, actor, { name: 'Racing', currency: 'USD', definition })
    beforeNextBatch(() => archiveTemplate(db, actor, racing.id, { version: 1 }))
    expect(await refusal(applyTemplate(db, actor, shop.id, { version: shop.version, templateId: racing.id }))).toBe('409 TEMPLATE_UNAVAILABLE')
    expect(await db.$count(serviceTypes, eq(serviceTypes.shopId, shop.id))).toBe(0)
  })

  it('answers 404 for a shop or a template that doesn\'t exist', async () => {
    const template = await createTemplate(db, actor, { name: 'Standard', currency: 'USD', definition })
    const shop = await createShop(db, actor, input())
    const missing = '01900000-0000-7000-8000-000000000000'
    expect(await refusal(applyTemplate(db, actor, missing, { version: 1, templateId: template.id }))).toBe('404 NOT_FOUND')
    expect(await refusal(applyTemplate(db, actor, shop.id, { version: shop.version, templateId: missing }))).toBe('404 NOT_FOUND')
  })
})
