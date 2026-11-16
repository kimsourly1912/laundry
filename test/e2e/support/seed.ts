import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import { hashPassword } from 'better-auth/crypto'
import { seedPlatformAdmin } from '#server/features/identity'
import { createPriceItem, createServiceType } from '#server/features/pricing'
import { createShop, platformShopActor } from '#server/features/shops'
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
  /** Adds customers (customers.test.ts). */
  customerOwner: { username: 'e2e_customer_owner', password: 'e2e customer password 1', shop: 'Battambang Laundry' },
  /** Takes an order through to collection (orders.test.ts), on a ready price list. */
  orderOwner: { username: 'e2e_order_owner', password: 'e2e order password 1', shop: 'Phnom Penh Fresh' },
  /** Gets a receipt designed by the platform and sees an order's receipt (receipts.test.ts). */
  receiptOwner: { username: 'e2e_receipt_owner', password: 'e2e receipt password 1', shop: 'Kep Laundry' },
} as const

export type E2eAccounts = typeof E2E_ACCOUNTS

/** Seeds the e2e database through the server's own services, as the platform would. */
export async function seedE2e(dbFile: string) {
  const client = createClient({ url: `file:${dbFile}`, timeout: 5000 })
  const db = drizzle(client, { casing: 'snake_case' }) as unknown as Db
  try {
    const { admin, newOwner, owner, priceOwner, customerOwner, orderOwner, receiptOwner } = E2E_ACCOUNTS
    const { userId } = await seedPlatformAdmin({ db, username: admin.username, passwordHash: await hashPassword(admin.password) })
    const actor = { userId, platformRole: 'superadmin' as const }
    await createShop(db, actor, { name: newOwner.shop, slug: 'fresh-start', owner: { name: 'New Owner', username: newOwner.username, password: newOwner.password } })
    const shop = await createShop(db, actor, { name: owner.shop, slug: 'kampot-clean', owner: { name: 'Owner', username: owner.username, password: owner.password } })
    const priceShop = await createShop(db, actor, { name: priceOwner.shop, slug: 'siem-reap-wash', owner: { name: 'Price Owner', username: priceOwner.username, password: priceOwner.password } })
    const customerShop = await createShop(db, actor, { name: customerOwner.shop, slug: 'battambang-laundry', owner: { name: 'Customer Owner', username: customerOwner.username, password: customerOwner.password } })
    const orderShop = await createShop(db, actor, { name: orderOwner.shop, slug: 'phnom-penh-fresh', owner: { name: 'Order Owner', username: orderOwner.username, password: orderOwner.password } })
    // The platform keeps the price list (D26).
    const orderActor = await platformShopActor(db, actor, orderShop.id)
    const wash = await createServiceType(db, orderActor, { nameEn: 'Wash & iron', nameKm: 'បោក និងអ៊ុត' })
    await createPriceItem(db, orderActor, { serviceTypeId: wash.id, nameEn: 'Shirt', nameKm: 'អាវ', unit: 'piece', price: 2000 })
    await createPriceItem(db, orderActor, { serviceTypeId: wash.id, nameEn: 'Mixed clothes', nameKm: 'ខោអាវចម្រុះ', unit: 'kg', price: 3000 })
    const receiptShop = await createShop(db, actor, { name: receiptOwner.shop, slug: 'kep-laundry', owner: { name: 'Receipt Owner', username: receiptOwner.username, password: receiptOwner.password } })
    const receiptActor = await platformShopActor(db, actor, receiptShop.id)
    const receiptWash = await createServiceType(db, receiptActor, { nameEn: 'Wash & iron', nameKm: 'បោក និងអ៊ុត' })
    await createPriceItem(db, receiptActor, { serviceTypeId: receiptWash.id, nameEn: 'Shirt', nameKm: 'អាវ', unit: 'piece', price: 2000 })
    // Past their first sign-in already: the admin and these owners have their own passwords.
    for (const id of [userId, shop.owner!.id, priceShop.owner!.id, customerShop.owner!.id, orderShop.owner!.id, receiptShop.owner!.id]) await db.update(user).set({ mustChangePassword: false }).where(eq(user.id, id))
  }
  finally {
    client.close()
  }
}
