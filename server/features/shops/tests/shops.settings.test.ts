import { describe, expect, it } from 'vitest'
import { authorizeShop } from '#server/features/identity'
import { getSettings } from '#server/features/shops'
import { createTestDb } from '#server/tests/support/db'
import { createOwner } from '#server/tests/support/auth'

// The shop's details as its owner reads them, two shops apart. Only the platform changes them
// (D44): shops.platform.test.ts → updateShop.

describe('shop settings', () => {
  it('reads the actor\'s own shop, with its defaults', async () => {
    const db = await createTestDb()
    const actorOf = async (userId: string) => authorizeShop({ db, user: { id: userId, role: 'user' }, permissions: { shop: ['read'] } })
    const a = await actorOf((await createOwner(db, { name: 'Shop A' })).userId)
    const b = await actorOf((await createOwner(db, { name: 'Shop B' })).userId)
    expect(await getSettings(db, a)).toEqual({ name: 'Shop A', phone: null, address: null, currency: 'KHR', version: 1 })
    expect((await getSettings(db, b)).name).toBe('Shop B')
  })
})
