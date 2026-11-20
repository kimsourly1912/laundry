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
  /** Changes the shop's settings (settings.test.ts). */
  settingsOwner: { username: 'e2e_settings_owner', password: 'e2e settings password 1', shop: 'Siem Reap Wash' },
  /** Takes orders at the counter (orders.test.ts). */
  counterOwner: { username: 'e2e_counter_owner', password: 'e2e counter password 1', shop: 'Linda Laundry' },
  /** Another shop's owner: never sees the counter owner's orders (orders.test.ts). */
  otherOwner: { username: 'e2e_other_owner', password: 'e2e other password 1', shop: 'Beta Wash' },
  /** A disposable shop with no slips: the platform sets one up from the shop (shop-setup.test.ts, pilot plan §2). */
  pilotOwner: { username: 'e2e_pilot_owner', password: 'e2e pilot password 1', shop: 'Pilot Test Laundry' },
} as const

export type E2eAccounts = typeof E2E_ACCOUNTS

/** Seeds the e2e database through the server's own services, as the platform would. */
export async function seedE2e(dbFile: string) {
  const client = createClient({ url: `file:${dbFile}`, timeout: 5000 })
  const db = drizzle(client, { casing: 'snake_case' }) as unknown as Db
  try {
    const { admin, newOwner, owner, settingsOwner, counterOwner, otherOwner, pilotOwner } = E2E_ACCOUNTS
    const { userId } = await seedPlatformAdmin({ db, username: admin.username, passwordHash: await hashPassword(admin.password) })
    const actor = { userId, platformRole: 'superadmin' as const }
    await createShop(db, actor, { name: newOwner.shop, slug: 'fresh-start', owner: { name: 'New Owner', username: newOwner.username, password: newOwner.password } })
    const shop = await createShop(db, actor, { name: owner.shop, slug: 'kampot-clean', owner: { name: 'Owner', username: owner.username, password: owner.password } })
    const settingsShop = await createShop(db, actor, { name: settingsOwner.shop, slug: 'siem-reap-wash', owner: { name: 'Settings Owner', username: settingsOwner.username, password: settingsOwner.password } })
    const counterShop = await createShop(db, actor, { name: counterOwner.shop, slug: 'linda-laundry', owner: { name: 'Counter Owner', username: counterOwner.username, password: counterOwner.password } })
    const otherShop = await createShop(db, actor, { name: otherOwner.shop, slug: 'beta-wash', owner: { name: 'Other Owner', username: otherOwner.username, password: otherOwner.password } })
    const pilotShop = await createShop(db, actor, { name: pilotOwner.shop, slug: 'pilot-test-laundry', owner: { name: 'Pilot Owner', username: pilotOwner.username, password: pilotOwner.password } })
    // Past their first sign-in already: the admin and these owners have their own passwords.
    for (const id of [userId, shop.owner!.id, settingsShop.owner!.id, counterShop.owner!.id, otherShop.owner!.id, pilotShop.owner!.id]) await db.update(user).set({ mustChangePassword: false }).where(eq(user.id, id))
  }
  finally {
    client.close()
  }
}
