import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_ACTIVE_SERVICE_TYPES } from '#shared/contracts/pricing'
import { authorizeShop } from '#server/features/identity'
import type { ShopActor } from '#server/features/identity'
import { archivePriceItem, archiveServiceType, createPriceItem, createServiceType, listPriceItems, listServiceTypes, updatePriceItem, updateServiceType } from '#server/features/pricing'
import { priceItems, serviceTypes } from '#server/features/pricing/pricing.schema'
import { auditEvents } from '#server/features/platform/platform.schema'
import type { Db } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { createTestDb } from '#server/tests/support/db'
import { createOwner } from '#server/tests/support/auth'

// The price list (M2.1) against SQLite built from the migrations, always with two shops.

let db: Db
let a: ShopActor
let b: ShopActor

const actorOf = async (userId: string) => ({ ...await authorizeShop({ db, user: { id: userId, role: 'user' }, permissions: { price: ['write'] } }), requestId: 'req-1' })

beforeEach(async () => {
  db = await createTestDb()
  a = await actorOf((await createOwner(db)).userId)
  b = await actorOf((await createOwner(db)).userId)
})

function refusal(promise: Promise<unknown>) {
  return promise.then(() => 'allowed', (error: { statusCode?: number, data?: { code?: string }, message?: string }) =>
    error.statusCode ? `${error.statusCode} ${error.data?.code}` : `error: ${error.message}`)
}

const wash = (actor: ShopActor, nameEn = 'Wash & iron') => createServiceType(db, actor, { nameEn, nameKm: null })
const shirt = (actor: ShopActor, serviceTypeId: string, extra: Partial<{ nameEn: string, price: number, unit: 'piece' | 'kg' }> = {}) =>
  createPriceItem(db, actor, { serviceTypeId, nameEn: 'Shirt', nameKm: 'អាវ', unit: 'piece', price: 2000, ...extra })
const MISSING = '01900000-0000-7000-8000-000000000000'

describe('service types', () => {
  it('creates in list order, lists only the actor\'s shop, audits in the shop\'s history', async () => {
    const first = await wash(a)
    const second = await wash(a, 'Dry clean')
    await wash(b, 'Other shop\'s')
    expect([first.sort, second.sort]).toEqual([1, 2])
    expect((await listServiceTypes(db, a, {})).items.map(type => type.nameEn)).toEqual(['Wash & iron', 'Dry clean'])
    expect((await listServiceTypes(db, b, {})).items.map(type => type.nameEn)).toEqual(['Other shop\'s'])
    const [row] = await db.select().from(auditEvents).where(eq(auditEvents.targetId, first.id))
    expect(row).toMatchObject({ shopId: a.shopId, actorUserId: a.userId, action: 'service-type.create', requestId: 'req-1' })
  })

  it('renames at the version read; another shop\'s is 404; a stale version 409', async () => {
    const type = await wash(a)
    expect(await updateServiceType(db, a, type.id, { version: 1, nameEn: 'Washing', nameKm: 'បោក' })).toMatchObject({ nameEn: 'Washing', nameKm: 'បោក', version: 2 })
    expect(await refusal(updateServiceType(db, b, type.id, { version: 2, nameEn: 'Mine', nameKm: null }))).toBe('404 NOT_FOUND')
    expect(await refusal(updateServiceType(db, a, type.id, { version: 1, nameEn: 'Late', nameKm: null }))).toBe('409 VERSION_CONFLICT')
    expect((await listServiceTypes(db, a, {})).items[0]!.nameEn).toBe('Washing')
  })

  it('two renames of one version at once: one wins, one 409, one audit row', async () => {
    const type = await wash(a)
    const results = await Promise.all([
      refusal(updateServiceType(db, a, type.id, { version: 1, nameEn: 'One', nameKm: null })),
      refusal(updateServiceType(db, a, type.id, { version: 1, nameEn: 'Two', nameKm: null })),
    ])
    expect(results.sort()).toEqual(['409 VERSION_CONFLICT', 'allowed'])
    expect(await db.$count(auditEvents, eq(auditEvents.action, 'service-type.update'))).toBe(1)
  })

  it('archives only without active items; then not offered, not renamed, not archived twice', async () => {
    const type = await wash(a)
    const item = await shirt(a, type.id)
    expect(await refusal(archiveServiceType(db, a, type.id, 1))).toBe('409 SERVICE_TYPE_IN_USE')
    await archivePriceItem(db, a, item.id, item.version)
    expect(await archiveServiceType(db, a, type.id, 1)).toMatchObject({ status: 'archived', version: 2 })
    expect((await listServiceTypes(db, a, {})).items).toEqual([])
    expect((await listServiceTypes(db, a, { status: 'archived' })).items.map(t => t.id)).toEqual([type.id])
    expect(await refusal(archiveServiceType(db, a, type.id, 2))).toBe('409 INVALID_STATE')
    expect(await refusal(updateServiceType(db, a, type.id, { version: 2, nameEn: 'Back', nameKm: null }))).toBe('409 INVALID_STATE')
  })

  it('another shop can\'t archive it', async () => {
    const type = await wash(a)
    expect(await refusal(archiveServiceType(db, b, type.id, 1))).toBe('404 NOT_FOUND')
    expect((await listServiceTypes(db, a, {})).items).toHaveLength(1)
  })

  it(`at most ${MAX_ACTIVE_SERVICE_TYPES} active per shop; the other shop isn't counted`, async () => {
    for (let n = 0; n < MAX_ACTIVE_SERVICE_TYPES; n++) await wash(a, `Type ${n}`)
    expect(await refusal(wash(a, 'One more'))).toBe('409 PRICE_LIST_FULL')
    expect(await db.$count(serviceTypes, eq(serviceTypes.shopId, a.shopId))).toBe(MAX_ACTIVE_SERVICE_TYPES)
    expect(await refusal(wash(b))).toBe('allowed')
  })
})

describe('price items', () => {
  it('creates in an active service type of the shop; lists only the actor\'s shop', async () => {
    const type = await wash(a)
    const item = await shirt(a, type.id)
    expect(item).toMatchObject({ serviceTypeId: type.id, nameEn: 'Shirt', nameKm: 'អាវ', unit: 'piece', price: 2000, sort: 1, status: 'active', version: 1 })
    await shirt(b, (await wash(b)).id, { nameEn: 'B shirt' })
    expect((await listPriceItems(db, a, {})).items.map(i => i.nameEn)).toEqual(['Shirt'])
  })

  it('never into another shop\'s service type: 409, nothing written (also by the database\'s composite key)', async () => {
    const theirs = await wash(b)
    expect(await refusal(shirt(a, theirs.id))).toBe('409 SERVICE_TYPE_UNAVAILABLE')
    expect(await refusal(shirt(a, MISSING))).toBe('409 SERVICE_TYPE_UNAVAILABLE')
    expect(await db.$count(priceItems)).toBe(0)
    // Written around the service: the database still refuses a cross-shop link.
    const insert = db.insert(priceItems).values({ id: newId(), shopId: a.shopId, serviceTypeId: theirs.id, nameEn: 'X', unit: 'piece', price: 1, sort: 1 })
    await expect(insert).rejects.toMatchObject({ cause: { message: expect.stringMatching(/FOREIGN KEY/i) } })
  })

  it('not into an archived service type: neither a new item nor a moved one', async () => {
    const type = await wash(a)
    const other = await wash(a, 'Dry clean')
    const item = await shirt(a, other.id)
    await archiveServiceType(db, a, type.id, 1)
    expect(await refusal(shirt(a, type.id))).toBe('409 SERVICE_TYPE_UNAVAILABLE')
    expect(await refusal(updatePriceItem(db, a, item.id, { version: 1, serviceTypeId: type.id, nameEn: 'Shirt', nameKm: null, unit: 'piece', price: 2000 }))).toBe('409 SERVICE_TYPE_UNAVAILABLE')
    expect((await listPriceItems(db, a, {})).items[0]!.serviceTypeId).toBe(other.id)
  })

  it('edits price, unit and service type at the version read; audits which fields', async () => {
    const [ironing, washing] = [await wash(a, 'Ironing'), await wash(a, 'Washing')]
    const item = await shirt(a, ironing.id)
    const updated = await updatePriceItem(db, a, item.id, { version: 1, serviceTypeId: washing.id, nameEn: 'Shirt', nameKm: 'អាវ', unit: 'kg', price: 4500 })
    expect(updated).toMatchObject({ serviceTypeId: washing.id, unit: 'kg', price: 4500, version: 2 })
    const [row] = await db.select().from(auditEvents).where(and(eq(auditEvents.targetId, item.id), eq(auditEvents.action, 'price-item.update')))
    expect(row!.data).toEqual({ fields: ['serviceTypeId', 'unit', 'price'] })
  })

  it('edit: another shop\'s 404; stale 409; into another shop\'s type 409; archived 409', async () => {
    const type = await wash(a)
    const item = await shirt(a, type.id)
    const input = { version: 1, serviceTypeId: type.id, nameEn: 'Shirt', nameKm: null, unit: 'piece' as const, price: 1 }
    expect(await refusal(updatePriceItem(db, b, item.id, input))).toBe('404 NOT_FOUND')
    expect(await refusal(updatePriceItem(db, a, item.id, { ...input, serviceTypeId: (await wash(b)).id }))).toBe('409 SERVICE_TYPE_UNAVAILABLE')
    await updatePriceItem(db, a, item.id, input)
    expect(await refusal(updatePriceItem(db, a, item.id, input))).toBe('409 VERSION_CONFLICT')
    await archivePriceItem(db, a, item.id, 2)
    expect(await refusal(updatePriceItem(db, a, item.id, { ...input, version: 3 }))).toBe('409 INVALID_STATE')
    expect((await listPriceItems(db, a, { status: 'archived' })).items[0]).toMatchObject({ price: 1, status: 'archived' })
  })

  it('archive: another shop\'s 404, stale 409, twice 409', async () => {
    const item = await shirt(a, (await wash(a)).id)
    expect(await refusal(archivePriceItem(db, b, item.id, 1))).toBe('404 NOT_FOUND')
    expect(await refusal(archivePriceItem(db, a, item.id, 7))).toBe('409 VERSION_CONFLICT')
    await archivePriceItem(db, a, item.id, 1)
    expect(await refusal(archivePriceItem(db, a, item.id, 2))).toBe('409 INVALID_STATE')
  })

  it('a service type archived while an item is saved into it: the item isn\'t written', async () => {
    const type = await wash(a)
    const results = await Promise.all([refusal(archiveServiceType(db, a, type.id, 1)), refusal(shirt(a, type.id))])
    const items = await db.$count(priceItems, eq(priceItems.status, 'active'))
    const [archived] = await db.select({ status: serviceTypes.status }).from(serviceTypes).where(eq(serviceTypes.id, type.id))
    // Never both: an archived service type with an active item.
    expect(archived!.status === 'archived' && items > 0).toBe(false)
    expect(results).toContain('allowed')
  })
})
