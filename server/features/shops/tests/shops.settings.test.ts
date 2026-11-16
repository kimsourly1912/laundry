import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { UpdateShopSettingsInput } from '#shared/contracts/shop-settings'
import { authorizeShop } from '#server/features/identity'
import type { ShopActor } from '#server/features/identity'
import { archivePriceItem, createPriceItem, createServiceType } from '#server/features/pricing'
import { getSettings, suspendShop, updateSettings } from '#server/features/shops'
import { auditEvents } from '#server/features/platform/platform.schema'
import type { Db } from '#server/utils/batch'
import { createTestDb } from '#server/tests/support/db'
import { createOwner, createTestUser } from '#server/tests/support/auth'

// The shop's own settings (M2.1), two shops apart.

let db: Db
let a: ShopActor
let b: ShopActor

const actorOf = async (userId: string) => authorizeShop({ db, user: { id: userId, role: 'user' }, permissions: { shop: ['update'] } })

beforeEach(async () => {
  db = await createTestDb()
  a = await actorOf((await createOwner(db, { name: 'Shop A' })).userId)
  b = await actorOf((await createOwner(db, { name: 'Shop B' })).userId)
})

function refusal(promise: Promise<unknown>) {
  return promise.then(() => 'allowed', (error: { statusCode?: number, data?: { code?: string }, message?: string }) =>
    error.statusCode ? `${error.statusCode} ${error.data?.code}` : `error: ${error.message}`)
}

const input = (extra: Partial<UpdateShopSettingsInput> = {}): UpdateShopSettingsInput => ({
  version: 1,
  name: 'Shop A',
  phone: '012 345 678',
  address: 'St 271, Phnom Penh',
  currency: 'KHR',
  policyTextKm: null,
  policyTextEn: 'Clothes left over 30 days are donated.',
  reminderAfterDays: 3,
  language: 'km',
  ...extra,
})

describe('shop settings', () => {
  it('reads the actor\'s own shop, with its defaults', async () => {
    expect(await getSettings(db, a)).toMatchObject({ name: 'Shop A', currency: 'KHR', reminderAfterDays: 3, language: 'en', currencyLocked: false, version: 1 })
    expect((await getSettings(db, b)).name).toBe('Shop B')
  })

  it('saves every setting at the version read; the other shop is untouched; the audit names the fields', async () => {
    const saved = await updateSettings(db, a, input({ name: 'Shop A Wash', currency: 'USD' }))
    expect(saved).toMatchObject({ name: 'Shop A Wash', phone: '012 345 678', currency: 'USD', language: 'km', version: 2 })
    expect(await getSettings(db, b)).toMatchObject({ name: 'Shop B', currency: 'KHR', version: 1 })
    const [row] = await db.select().from(auditEvents).where(eq(auditEvents.action, 'shop.settings.update'))
    expect(row).toMatchObject({ shopId: a.shopId, targetId: a.shopId })
    expect((row!.data as { fields: string[] }).fields.sort()).toEqual(['address', 'currency', 'language', 'name', 'phone', 'policyTextEn'])
  })

  it('409 VERSION_CONFLICT when stale, also after the platform suspended and resumed it', async () => {
    await updateSettings(db, a, input())
    expect(await refusal(updateSettings(db, a, input({ name: 'Late' })))).toBe('409 VERSION_CONFLICT')
    const admin = await createTestUser(db, { role: 'superadmin' })
    await suspendShop(db, { userId: admin.userId, platformRole: 'superadmin' }, a.shopId, { version: 2 })
    expect(await refusal(updateSettings(db, a, input({ version: 2 })))).toBe('409 VERSION_CONFLICT')
    expect((await getSettings(db, a)).name).toBe('Shop A')
  })

  it('the currency changes only while the price list is empty, archived items included (D22)', async () => {
    const type = await createServiceType(db, a, { nameEn: 'Wash', nameKm: null })
    const item = await createPriceItem(db, a, { serviceTypeId: type.id, nameEn: 'Shirt', nameKm: null, unit: 'piece', price: 2000 })
    expect((await getSettings(db, a)).currencyLocked).toBe(true)
    expect(await refusal(updateSettings(db, a, input({ currency: 'USD' })))).toBe('409 CURRENCY_LOCKED')
    await archivePriceItem(db, a, item.id, 1)
    expect(await refusal(updateSettings(db, a, input({ currency: 'USD' })))).toBe('409 CURRENCY_LOCKED')
    // Everything else still saves; the other shop's empty list lets it change.
    expect(await refusal(updateSettings(db, a, input({ phone: '099 999 999' })))).toBe('allowed')
    expect(await refusal(updateSettings(db, b, input({ name: 'Shop B', currency: 'USD' })))).toBe('allowed')
  })
})
