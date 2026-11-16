import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import { hashPassword } from 'better-auth/crypto'
import { seedPlatformAdmin } from '#server/features/identity'
import { createShop } from '#server/features/shops'
import { user } from '#server/db/tables'
import type { Db } from '#server/utils/batch'

/** The accounts the e2e tests sign in with (test values: this database serves only the test browser). */
export const E2E_ACCOUNTS = {
  admin: { username: 'e2e_admin', password: 'e2e admin password 1' },
  /** On the temporary password the shop was created with: the forced change. */
  newOwner: { username: 'e2e_new_owner', password: 'e2e temporary pass 1', shop: 'Fresh Start Laundry' },
  /** Has their own password: signed in, then signed out by the platform. */
  owner: { username: 'e2e_owner', password: 'e2e owner password 1', shop: 'Kampot Clean' },
  /** Sets up a price list (prices.test.ts). */
  priceOwner: { username: 'e2e_price_owner', password: 'e2e price password 1', shop: 'Siem Reap Wash' },
} as const

export type E2eAccounts = typeof E2E_ACCOUNTS

/** Seeds the e2e database through the server's own services, as the platform would. */
export async function seedE2e(dbFile: string) {
  const client = createClient({ url: `file:${dbFile}`, timeout: 5000 })
  const db = drizzle(client, { casing: 'snake_case' }) as unknown as Db
  try {
    const { admin, newOwner, owner, priceOwner } = E2E_ACCOUNTS
    const { userId } = await seedPlatformAdmin({ db, username: admin.username, passwordHash: await hashPassword(admin.password) })
    const actor = { userId, platformRole: 'superadmin' as const }
    await createShop(db, actor, { name: newOwner.shop, slug: 'fresh-start', owner: { name: 'New Owner', username: newOwner.username, password: newOwner.password } })
    const shop = await createShop(db, actor, { name: owner.shop, slug: 'kampot-clean', owner: { name: 'Owner', username: owner.username, password: owner.password } })
    const priceShop = await createShop(db, actor, { name: priceOwner.shop, slug: 'siem-reap-wash', owner: { name: 'Price Owner', username: priceOwner.username, password: priceOwner.password } })
    // Past their first sign-in already: the admin and these owners have their own passwords.
    for (const id of [userId, shop.owner!.id, priceShop.owner!.id]) await db.update(user).set({ mustChangePassword: false }).where(eq(user.id, id))
  }
  finally {
    client.close()
  }
}
