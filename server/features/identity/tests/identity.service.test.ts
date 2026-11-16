import { eq } from 'drizzle-orm'
import { hashPassword } from 'better-auth/crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { authorizePlatform, authorizeShop, authorizeSignedIn, me, seedPlatformAdmin } from '#server/features/identity'
import type { SessionUser } from '#server/features/identity'
import { member, user } from '#server/db/tables'
import { shopSettings } from '#server/features/shops/shops.schema'
import type { Db } from '#server/utils/batch'
import { createTestDb } from '#server/tests/support/db'
import { addMember, createOwner, createTestShop, createTestUser } from '#server/tests/support/auth'

let db: Db
beforeEach(async () => {
  db = await createTestDb()
})

const sessionOf = (userId: string, extra: Partial<SessionUser> = {}): SessionUser => ({ id: userId, role: 'user', ...extra })

function refusal(promise: Promise<unknown> | (() => unknown)) {
  const run = typeof promise === 'function' ? Promise.resolve().then(promise) : promise
  return run.then(() => 'allowed', (error: { statusCode?: number, data?: { code?: string }, message?: string }) =>
    error.statusCode ? `${error.statusCode} ${error.data?.code}` : `error: ${error.message}`)
}

describe('authorizeShop (spec §12, in order)', () => {
  it('returns the actor with the shop from the membership and the granted statements', async () => {
    const owner = await createOwner(db)
    const actor = await authorizeShop({ db, user: sessionOf(owner.userId), permissions: { order: ['transition'] } })
    expect(actor).toMatchObject({ userId: owner.userId, shopId: owner.shopId, role: 'owner' })
    expect(actor.statements).toContain('order:transition')
  })

  it('401 without a session, or for a banned user', async () => {
    const owner = await createOwner(db)
    expect(await refusal(authorizeShop({ db, user: null, permissions: { order: ['read'] } }))).toBe('401 UNAUTHENTICATED')
    expect(await refusal(authorizeShop({ db, user: sessionOf(owner.userId, { banned: true }), permissions: { order: ['read'] } }))).toBe('401 UNAUTHENTICATED')
  })

  it('403 PASSWORD_CHANGE_REQUIRED before anything else', async () => {
    const owner = await createOwner(db, { status: 'suspended' })
    expect(await refusal(authorizeShop({ db, user: sessionOf(owner.userId, { mustChangePassword: true }), permissions: { order: ['read'] } }))).toBe('403 PASSWORD_CHANGE_REQUIRED')
  })

  it('403 NO_SHOP without a membership, a super admin included', async () => {
    const loner = await createTestUser(db)
    const admin = await createTestUser(db, { role: 'superadmin' })
    expect(await refusal(authorizeShop({ db, user: sessionOf(loner.userId), permissions: { order: ['read'] } }))).toBe('403 NO_SHOP')
    expect(await refusal(authorizeShop({ db, user: sessionOf(admin.userId, { role: 'superadmin' }), permissions: { order: ['read'] } }))).toBe('403 NO_SHOP')
  })

  it('403 NO_SHOP for a shop without its settings row', async () => {
    const shop = await createTestShop(db, { settings: false })
    const owner = await createTestUser(db)
    await addMember(db, shop.shopId, owner.userId)
    expect(await refusal(authorizeShop({ db, user: sessionOf(owner.userId), permissions: { order: ['read'] } }))).toBe('403 NO_SHOP')
  })

  it('403 SHOP_SUSPENDED for every statement of a suspended shop', async () => {
    const owner = await createOwner(db, { status: 'suspended' })
    expect(await refusal(authorizeShop({ db, user: sessionOf(owner.userId), permissions: { shop: ['read'] } }))).toBe('403 SHOP_SUSPENDED')
  })

  it('403 FORBIDDEN when the role lacks a statement', async () => {
    const shop = await createTestShop(db)
    const staff = await createTestUser(db)
    await addMember(db, shop.shopId, staff.userId, 'staff')
    expect(await refusal(authorizeShop({ db, user: sessionOf(staff.userId), permissions: { order: ['cancel'] } }))).toBe('403 FORBIDDEN')
    expect(await refusal(authorizeShop({ db, user: sessionOf(staff.userId), permissions: { order: ['read', 'cancel'] } }))).toBe('403 FORBIDDEN')
    expect(await refusal(authorizeShop({ db, user: sessionOf(staff.userId), permissions: { order: ['transition'] } }))).toBe('allowed')
  })

  it('treats an unknown statement as a bug (an internal error), not a refusal', async () => {
    const owner = await createOwner(db)
    expect(await refusal(authorizeShop({ db, user: sessionOf(owner.userId), permissions: { order: ['explode'] } as never }))).toMatch(/^error: Unknown permission statement/)
  })

  it('acts in each user\'s own shop: two shops never mix', async () => {
    const a = await createOwner(db)
    const b = await createOwner(db)
    expect((await authorizeShop({ db, user: sessionOf(a.userId), permissions: { order: ['read'] } })).shopId).toBe(a.shopId)
    expect((await authorizeShop({ db, user: sessionOf(b.userId), permissions: { order: ['read'] } })).shopId).toBe(b.shopId)
  })
})

describe('one shop per user (spec T4)', () => {
  it('the database refuses a second membership', async () => {
    const owner = await createOwner(db)
    const other = await createTestShop(db)
    await expect(addMember(db, other.shopId, owner.userId)).rejects.toMatchObject({ cause: { message: expect.stringMatching(/UNIQUE constraint failed: member.user_id/) } })
  })
})

describe('authorizePlatform', () => {
  it('lets a super admin act on the platform', async () => {
    const admin = await createTestUser(db, { role: 'superadmin' })
    expect(authorizePlatform({ user: sessionOf(admin.userId, { role: 'superadmin' }), permissions: { shop: ['suspend'] } })).toEqual({ userId: admin.userId, platformRole: 'superadmin' })
  })

  it('refuses 401, 403 PASSWORD_CHANGE_REQUIRED, and 403 FORBIDDEN for a shop owner', async () => {
    const owner = await createOwner(db)
    expect(await refusal(() => authorizePlatform({ user: null, permissions: { shop: ['read'] } }))).toBe('401 UNAUTHENTICATED')
    expect(await refusal(() => authorizePlatform({ user: sessionOf('x', { role: 'superadmin', mustChangePassword: true }), permissions: { shop: ['read'] } }))).toBe('403 PASSWORD_CHANGE_REQUIRED')
    expect(await refusal(() => authorizePlatform({ user: sessionOf(owner.userId), permissions: { shop: ['read'] } }))).toBe('403 FORBIDDEN')
  })

  it('treats an unknown statement as a bug', () => {
    expect(() => authorizePlatform({ user: sessionOf('x', { role: 'superadmin' }), permissions: { order: ['read'] } as never })).toThrow(/Unknown permission statement/)
  })
})

describe('authorizeSignedIn', () => {
  it('refuses a temporary password with 403, and no session with 401', async () => {
    expect(authorizeSignedIn(sessionOf('u'))).toEqual({ userId: 'u' })
    expect(await refusal(() => authorizeSignedIn(sessionOf('u', { mustChangePassword: true })))).toBe('403 PASSWORD_CHANGE_REQUIRED')
    expect(await refusal(() => authorizeSignedIn(null))).toBe('401 UNAUTHENTICATED')
  })
})

describe('me', () => {
  it('describes an owner: the shop and its statements', async () => {
    const owner = await createOwner(db, { name: 'Linda Laundry' })
    const answer = await me(db, sessionOf(owner.userId, { name: 'Linda', username: owner.username }))
    expect(answer).toMatchObject({ user: { id: owner.userId, name: 'Linda', username: owner.username }, mustChangePassword: false, platformRole: null, shop: { id: owner.shopId, name: 'Linda Laundry', status: 'active' } })
    expect(answer.statements).toContain('order:cancel')
  })

  it('answers on a temporary password, saying so', async () => {
    const owner = await createOwner(db)
    expect((await me(db, sessionOf(owner.userId, { mustChangePassword: true }))).mustChangePassword).toBe(true)
  })

  it('shows a suspended shop with no statements', async () => {
    const owner = await createOwner(db, { status: 'suspended' })
    expect(await me(db, sessionOf(owner.userId))).toMatchObject({ shop: { status: 'suspended' }, statements: [] })
  })

  it('describes a super admin: no shop, the platform statements', async () => {
    const admin = await createTestUser(db, { role: 'superadmin' })
    const answer = await me(db, sessionOf(admin.userId, { role: 'superadmin' }))
    expect(answer).toMatchObject({ platformRole: 'superadmin', shop: null })
    expect(answer.statements).toContain('shop:create')
  })

  it('401 without a session or for a banned user', async () => {
    expect(await refusal(me(db, null))).toBe('401 UNAUTHENTICATED')
    expect(await refusal(me(db, sessionOf('u', { banned: true })))).toBe('401 UNAUTHENTICATED')
  })
})

describe('seedPlatformAdmin (spec §14)', () => {
  it('creates a super admin on a temporary password, with a normalized username', async () => {
    const created = await seedPlatformAdmin({ db, username: ' Admin ', passwordHash: await hashPassword('a long admin password') })
    expect(created.username).toBe('admin')
    const [row] = await db.select().from(user).where(eq(user.id, created.userId))
    expect(row).toMatchObject({ role: 'superadmin', username: 'admin', mustChangePassword: true, email: `${created.userId}@users.invalid` })
  })

  it('refuses when any super admin exists, and creates nothing', async () => {
    await createTestUser(db, { role: 'superadmin' })
    await expect(seedPlatformAdmin({ db, username: 'second', passwordHash: 'x' })).rejects.toMatchObject({ statusCode: 409, data: { code: 'PLATFORM_ADMIN_EXISTS' } })
    expect(await db.$count(user, eq(user.username, 'second'))).toBe(0)
  })

  it('never makes the admin a shop member', async () => {
    const created = await seedPlatformAdmin({ db, username: 'admin', passwordHash: 'x' })
    expect(await db.$count(member, eq(member.userId, created.userId))).toBe(0)
  })
})

describe('shop status', () => {
  it('only accepts active or suspended', async () => {
    const shop = await createTestShop(db, { settings: false })
    await expect(db.insert(shopSettings).values({ shopId: shop.shopId, status: 'closed' as never })).rejects.toMatchObject({ cause: { message: expect.stringMatching(/CHECK constraint failed/) } })
  })
})
