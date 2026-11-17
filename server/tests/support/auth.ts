import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { hashPassword } from 'better-auth/crypto'
import * as authSchema from '#auth/schema'
import { identityAuthOptions } from '#server/features/identity/identity.auth'
import { account, member, organization, user } from '#server/db/tables'
import { shopSettings } from '#server/features/shops/shops.schema'
import type { Db } from '#server/utils/batch'
import { newId } from '#server/utils/ids'

export const TEST_SITE = 'https://laundry.test'

interface TestAuthOptions {
  /** Better Auth limits only in production builds; on for the rate-limit tests. */
  rateLimit?: boolean
}

/** Our Better Auth configuration on a test database. */
export function createTestAuth(db: Db, options: TestAuthOptions = {}) {
  const { rateLimit = false } = options
  const config = identityAuthOptions({ siteUrl: TEST_SITE })
  return betterAuth({
    ...config,
    rateLimit: { ...config.rateLimit, enabled: rateLimit },
    baseURL: TEST_SITE,
    secret: 'test-secret-that-is-at-least-32-characters-long',
    database: drizzleAdapter(db, { provider: 'sqlite', schema: authSchema }),
  })
}

export type TestAuth = ReturnType<typeof createTestAuth>

/** The request headers of a session, from a response's `Set-Cookie`. */
export function sessionHeaders(headers: Headers): Headers {
  return new Headers({ cookie: headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ') })
}

/** Signs in with username and password; returns the session's headers. Throws when refused. */
export async function signIn(auth: TestAuth, username: string, password: string): Promise<Headers> {
  const { headers } = await auth.api.signInUsername({ body: { username, password }, returnHeaders: true })
  return sessionHeaders(headers)
}

export const TEST_PASSWORD = 'a long enough password'

let accounts = 0

interface TestUser {
  username?: string
  password?: string
  role?: 'user' | 'superadmin'
  mustChangePassword?: boolean
  banned?: boolean
}

/** A user with a password account, written as Better Auth stores them. */
export async function createTestUser(db: Db, values: TestUser = {}) {
  const { username = `person${++accounts}`, password = TEST_PASSWORD, role = 'user', mustChangePassword = false, banned = false } = values
  const id = newId()
  const now = new Date()
  await db.batch([
    db.insert(user).values({ id, name: username, email: `${id}@users.invalid`, emailVerified: true, username, displayUsername: username, role, mustChangePassword, banned, createdAt: now, updatedAt: now }),
    db.insert(account).values({ id: newId(), accountId: id, providerId: 'credential', userId: id, password: await hashPassword(password), createdAt: now, updatedAt: now }),
  ])
  return { userId: id, username, password }
}

interface TestShop {
  name?: string
  status?: 'active' | 'suspended'
  /** Write the shop's settings row (M1.5 always does). */
  settings?: boolean
}

/** A shop: its organization and its settings row. */
export async function createTestShop(db: Db, values: TestShop = {}) {
  const { name = `Shop ${++accounts}`, status = 'active', settings = true } = values
  const id = newId()
  await db.insert(organization).values({ id, name, slug: `shop-${id}`, createdAt: new Date() })
  if (settings) await db.insert(shopSettings).values({ shopId: id, status })
  return { shopId: id, name }
}

/** Makes the user a member of the shop with the role. */
export async function addMember(db: Db, shopId: string, userId: string, role: 'owner' | 'staff' = 'owner') {
  await db.insert(member).values({ id: newId(), organizationId: shopId, userId, role, createdAt: new Date() })
}

/** A shop and its owner, signed-in-able. */
export async function createOwner(db: Db, values: TestUser & TestShop = {}) {
  const shop = await createTestShop(db, values)
  const owner = await createTestUser(db, values)
  await addMember(db, shop.shopId, owner.userId)
  return { ...shop, ...owner }
}
