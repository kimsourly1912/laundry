import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { CreateShopInput, UpdateShopInput } from '#shared/contracts/platform-shops'
import { authorizeShop, me } from '#server/features/identity'
import type { PlatformActor } from '#server/features/identity'
import { createShop, getSettings, getShop, listShops, resetOwnerPassword, resumeShop, revokeOwnerSessions, suspendShop, updateShop } from '#server/features/shops'
import { auditEvents } from '#server/features/platform/platform.schema'
import { shopSettings } from '#server/features/shops/shops.schema'
import { account, member, organization, session, user } from '#server/db/tables'
import type { Db } from '#server/utils/batch'
import { createTestDb } from '#server/tests/support/db'
import { createTestAuth, createTestUser, signIn } from '#server/tests/support/auth'
import type { TestAuth } from '#server/tests/support/auth'

// The platform's shops (spec §9, M1.5) against SQLite built from the migrations, always two shops
// apart: an action on one never touches the other.

let db: Db
let auth: TestAuth
let actor: PlatformActor

beforeEach(async () => {
  db = await createTestDb()
  auth = createTestAuth(db)
  const admin = await createTestUser(db, { role: 'superadmin' })
  actor = { userId: admin.userId, platformRole: 'superadmin', requestId: 'req-1' }
})

let made = 0
function input(overrides: Partial<CreateShopInput> & { username?: string } = {}): CreateShopInput {
  const n = ++made
  const { username = `owner${n}`, ...rest } = overrides
  return { name: `Shop ${n}`, slug: `shop-${n}`, owner: { name: `Owner ${n}`, username, password: 'temporary password 1' }, ...rest }
}

/** The shop's details as the platform's form sends them: unchanged but for what's given. */
function details(change: Pick<UpdateShopInput, 'version' | 'name'> & Partial<UpdateShopInput>): UpdateShopInput {
  return { phone: null, address: null, currency: 'KHR', ...change }
}

function refusal(promise: Promise<unknown>) {
  return promise.then(() => 'allowed', (error: { statusCode?: number, data?: { code?: string, fieldErrors?: unknown }, message?: string }) =>
    error.statusCode ? `${error.statusCode} ${error.data?.code}` : `error: ${error.message}`)
}

const sessionUserOf = async (userId: string) => (await db.select().from(user).where(eq(user.id, userId)))[0]!
const sessionCount = (userId: string) => db.$count(session, eq(session.userId, userId))
const auditOf = (shopId: string) => db.select().from(auditEvents).where(and(eq(auditEvents.targetType, 'shop'), eq(auditEvents.targetId, shopId))).orderBy(auditEvents.createdAt)

/** Two shops, each with its owner signed in on two devices. */
async function twoShops() {
  const a = await createShop(db, actor, input())
  const b = await createShop(db, actor, input())
  for (const shop of [a, b]) {
    // A first sign-in, then the password change the temporary password asks for.
    await signIn(auth, shop.owner!.username, 'temporary password 1')
    await db.update(user).set({ mustChangePassword: false }).where(eq(user.id, shop.owner!.id))
    await signIn(auth, shop.owner!.username, 'temporary password 1')
  }
  return { a, b }
}

describe('createShop (one batch)', () => {
  it('creates the shop, its settings, its owner on a temporary password and the audit row', async () => {
    const shop = await createShop(db, actor, input({ name: 'Sokha Laundry', slug: 'sokha-laundry', username: 'sokha' }))
    expect(shop).toMatchObject({ name: 'Sokha Laundry', slug: 'sokha-laundry', status: 'active', version: 1, owner: { username: 'sokha', name: expect.any(String), mustChangePassword: true } })
    expect(shop.createdAt).toMatch(/^\d{4}-\d\d-\d\dT/)

    // The owner signs in with the temporary password and belongs to this shop only.
    const headers = await signIn(auth, 'sokha', 'temporary password 1')
    const signedIn = await auth.api.getSession({ headers })
    expect(signedIn?.user.id).toBe(shop.owner!.id)
    const meNow = await me(db, await sessionUserOf(shop.owner!.id))
    expect(meNow).toMatchObject({ mustChangePassword: true, platformRole: null, shop: { id: shop.id, name: 'Sokha Laundry', status: 'active' } })
    // Its role is a shop role, never a platform one; its email is the placeholder.
    expect(await sessionUserOf(shop.owner!.id)).toMatchObject({ role: 'user', email: `${shop.owner!.id}@users.invalid` })
    expect(await db.select({ role: member.role }).from(member).where(eq(member.userId, shop.owner!.id))).toEqual([{ role: 'owner' }])

    expect(await auditOf(shop.id)).toMatchObject([{ action: 'shop.create', shopId: null, actorUserId: actor.userId, requestId: 'req-1', data: { ownerUsername: 'sokha' } }])
  })

  it('never stores the password in clear, nor in the audit row', async () => {
    const shop = await createShop(db, actor, input())
    const [credential] = await db.select({ password: account.password }).from(account).where(eq(account.userId, shop.owner!.id))
    expect(credential!.password).not.toContain('temporary password 1')
    expect(JSON.stringify(await auditOf(shop.id))).not.toContain('temporary password 1')
  })

  it('409 USERNAME_TAKEN, ignoring case and spaces, and writes nothing', async () => {
    await createShop(db, actor, input({ username: 'sokha' }))
    const before = await db.$count(organization)
    const error = await createShop(db, actor, input({ username: ' Sokha ' })).catch(e => e)
    expect(error.data).toMatchObject({ code: 'USERNAME_TAKEN', fieldErrors: { 'owner.username': [expect.any(String)] } })
    expect(await db.$count(organization)).toBe(before)
  })

  it('409 USERNAME_TAKEN for a super admin\'s username too', async () => {
    const admin = await createTestUser(db, { username: 'ops', role: 'superadmin' })
    expect(await refusal(createShop(db, actor, input({ username: 'ops' })))).toBe('409 USERNAME_TAKEN')
    expect(await db.$count(member, eq(member.userId, admin.userId))).toBe(0)
  })

  it('409 SLUG_TAKEN, and writes nothing', async () => {
    await createShop(db, actor, input({ slug: 'clean' }))
    const users = await db.$count(user)
    expect(await refusal(createShop(db, actor, input({ slug: 'clean' })))).toBe('409 SLUG_TAKEN')
    expect(await db.$count(user)).toBe(users)
  })

  it('two saves at once with one username: one shop; the other 409 USERNAME_TAKEN, with nothing half-written', async () => {
    const results = await Promise.all([
      refusal(createShop(db, actor, input({ username: 'DARA ' }))),
      refusal(createShop(db, actor, input({ username: ' Dara ' }))),
    ])
    expect(results.sort()).toEqual(['409 USERNAME_TAKEN', 'allowed'])
    expect(await db.$count(organization)).toBe(1)
    expect(await db.$count(shopSettings)).toBe(1)
    expect(await db.$count(auditEvents)).toBe(1)
  })
})

describe('listShops and getShop', () => {
  it('lists newest first with owners, filters by status, searches name or short name, and pages', async () => {
    const first = await createShop(db, actor, input({ name: 'Bright Wash', slug: 'bright-wash' }))
    const second = await createShop(db, actor, input({ name: 'Clean Corner', slug: 'clean-corner' }))
    const third = await createShop(db, actor, input({ name: 'Kampot Fresh', slug: 'kampot' }))
    await suspendShop(db, actor, second.id, { version: 1 })

    const all = await listShops(db, { page: 1, pageSize: 20 })
    expect(all.items.map(shop => shop.id)).toEqual([third.id, second.id, first.id])
    expect(all).toMatchObject({ page: 1, pageSize: 20, total: 3 })
    expect(all.items[0]!.owner).toMatchObject({ id: third.owner!.id, username: third.owner!.username })

    expect((await listShops(db, { page: 1, pageSize: 20, status: 'suspended' })).items.map(shop => shop.id)).toEqual([second.id])
    expect((await listShops(db, { page: 1, pageSize: 20, status: 'active' })).total).toBe(2)
    expect((await listShops(db, { page: 1, pageSize: 20, search: 'WASH' })).items.map(shop => shop.id)).toEqual([first.id])
    expect((await listShops(db, { page: 1, pageSize: 20, search: 'kampot' })).items.map(shop => shop.id)).toEqual([third.id])

    const page2 = await listShops(db, { page: 2, pageSize: 2 })
    expect(page2).toMatchObject({ page: 2, pageSize: 2, total: 3 })
    expect(page2.items.map(shop => shop.id)).toEqual([first.id])
  })

  it('getShop: the shop with its owner; 404 for an unknown id', async () => {
    const shop = await createShop(db, actor, input())
    expect(await getShop(db, shop.id)).toEqual(shop)
    expect(await refusal(getShop(db, '01900000-0000-7000-8000-000000000000'))).toBe('404 NOT_FOUND')
  })
})

describe('updateShop', () => {
  it('renames at the version the admin saw, moves the version, audits which field; the other shop stays', async () => {
    const { a, b } = await twoShops()
    const renamed = await updateShop(db, actor, a.id, details({ version: 1, name: 'New Name' }))
    expect(renamed).toMatchObject({ name: 'New Name', version: 2 })
    expect(await getShop(db, b.id)).toMatchObject({ name: b.name, version: 1 })
    expect((await auditOf(a.id)).map(row => [row.action, row.data])).toEqual([['shop.create', expect.anything()], ['shop.update', { fields: ['name'] }]])
  })

  it('saves every detail the slips print (D44); the owner reads them; the audit names what changed', async () => {
    const { a, b } = await twoShops()
    const saved = await updateShop(db, actor, a.id, { version: 1, name: a.name, phone: '012 345 678', address: 'St 271, Phnom Penh', currency: 'USD' })
    expect(saved).toMatchObject({ name: a.name, phone: '012 345 678', address: 'St 271, Phnom Penh', currency: 'USD', version: 2 })
    const owner = await authorizeShop({ db, user: await sessionUserOf(a.owner!.id), permissions: { shop: ['read'] } })
    expect(await getSettings(db, owner)).toEqual({ name: a.name, phone: '012 345 678', address: 'St 271, Phnom Penh', currency: 'USD', version: 2 })
    expect(await getShop(db, b.id)).toMatchObject({ phone: null, address: null, currency: 'KHR', version: 1 })
    expect((await auditOf(a.id)).at(-1)?.data).toEqual({ fields: ['phone', 'address', 'currency'] })
    // The currency may change back at any time: orders keep a copy (D33).
    expect((await updateShop(db, actor, a.id, { version: 2, name: a.name, phone: saved.phone, address: saved.address, currency: 'KHR' })).currency).toBe('KHR')
  })

  it('409 VERSION_CONFLICT on a stale version, renaming nothing', async () => {
    const shop = await createShop(db, actor, input())
    await updateShop(db, actor, shop.id, details({ version: 1, name: 'First' }))
    expect(await refusal(updateShop(db, actor, shop.id, details({ version: 1, name: 'Second' })))).toBe('409 VERSION_CONFLICT')
    expect((await getShop(db, shop.id)).name).toBe('First')
  })

  it('two saves of one version at once: one wins, the other 409, one audit row', async () => {
    const shop = await createShop(db, actor, input())
    const results = await Promise.all([
      refusal(updateShop(db, actor, shop.id, details({ version: 1, name: 'One' }))),
      refusal(updateShop(db, actor, shop.id, details({ version: 1, name: 'Two' }))),
    ])
    expect(results.sort()).toEqual(['409 VERSION_CONFLICT', 'allowed'])
    expect((await getShop(db, shop.id)).version).toBe(2)
    expect((await auditOf(shop.id)).filter(row => row.action === 'shop.update')).toHaveLength(1)
  })

  it('404 for an unknown shop', async () => {
    expect(await refusal(updateShop(db, actor, '01900000-0000-7000-8000-000000000000', details({ version: 1, name: 'X' })))).toBe('404 NOT_FOUND')
  })
})

describe('suspendShop and resumeShop (spec §5)', () => {
  it('suspends one shop: its owner gets 403 SHOP_SUSPENDED and keeps their sessions; the other shop works', async () => {
    const { a, b } = await twoShops()
    const suspended = await suspendShop(db, actor, a.id, { version: 1 })
    expect(suspended).toMatchObject({ status: 'suspended', version: 2 })

    expect(await refusal(authorizeShop({ db, user: await sessionUserOf(a.owner!.id), permissions: { shop: ['read'] } }))).toBe('403 SHOP_SUSPENDED')
    expect(await refusal(authorizeShop({ db, user: await sessionUserOf(b.owner!.id), permissions: { shop: ['read'] } }))).toBe('allowed')
    // Signed in, so the app can show the notice.
    expect(await sessionCount(a.owner!.id)).toBe(2)
    expect((await me(db, await sessionUserOf(a.owner!.id))).shop?.status).toBe('suspended')

    const resumed = await resumeShop(db, actor, a.id, { version: 2 })
    expect(resumed).toMatchObject({ status: 'active', version: 3 })
    expect(await refusal(authorizeShop({ db, user: await sessionUserOf(a.owner!.id), permissions: { shop: ['read'] } }))).toBe('allowed')
    expect((await auditOf(a.id)).map(row => row.action)).toEqual(['shop.create', 'shop.suspend', 'shop.resume'])
    expect((await auditOf(b.id)).map(row => row.action)).toEqual(['shop.create'])
  })

  it('409 INVALID_STATE: suspending a suspended shop, resuming an active one', async () => {
    const shop = await createShop(db, actor, input())
    expect(await refusal(resumeShop(db, actor, shop.id, { version: 1 }))).toBe('409 INVALID_STATE')
    await suspendShop(db, actor, shop.id, { version: 1 })
    expect(await refusal(suspendShop(db, actor, shop.id, { version: 2 }))).toBe('409 INVALID_STATE')
  })

  it('409 VERSION_CONFLICT on a stale version', async () => {
    const shop = await createShop(db, actor, input())
    await updateShop(db, actor, shop.id, details({ version: 1, name: 'Renamed' }))
    expect(await refusal(suspendShop(db, actor, shop.id, { version: 1 }))).toBe('409 VERSION_CONFLICT')
    expect((await getShop(db, shop.id)).status).toBe('active')
  })

  it('a suspend and a rename of one version at once: one wins, the other 409', async () => {
    const shop = await createShop(db, actor, input())
    const results = await Promise.all([
      refusal(suspendShop(db, actor, shop.id, { version: 1 })),
      refusal(updateShop(db, actor, shop.id, details({ version: 1, name: 'Renamed' }))),
    ])
    expect(results.sort()).toEqual(['409 VERSION_CONFLICT', 'allowed'])
    expect((await getShop(db, shop.id)).version).toBe(2)
  })

  it('two suspends of one version at once: one wins, the other 409, one audit row', async () => {
    const shop = await createShop(db, actor, input())
    const results = await Promise.all([
      refusal(suspendShop(db, actor, shop.id, { version: 1 })),
      refusal(suspendShop(db, actor, shop.id, { version: 1 })),
    ])
    expect(results.sort()).toEqual(['409 VERSION_CONFLICT', 'allowed'])
    expect((await auditOf(shop.id)).filter(row => row.action === 'shop.suspend')).toHaveLength(1)
  })

  it('404 for an unknown shop', async () => {
    expect(await refusal(suspendShop(db, actor, '01900000-0000-7000-8000-000000000000', { version: 1 }))).toBe('404 NOT_FOUND')
  })
})

describe('resetOwnerPassword (spec §16: owner forgot the password)', () => {
  it('sets a temporary password, ends every session of that owner only, audits without the password', async () => {
    const { a, b } = await twoShops()
    await resetOwnerPassword(db, actor, a.id, { password: 'another temporary 2' })

    expect(await sessionCount(a.owner!.id)).toBe(0)
    expect(await sessionCount(b.owner!.id)).toBe(2)
    expect((await sessionUserOf(a.owner!.id)).mustChangePassword).toBe(true)
    expect((await sessionUserOf(b.owner!.id)).mustChangePassword).toBe(false)
    await expect(signIn(auth, a.owner!.username, 'temporary password 1')).rejects.toThrow()
    await expect(signIn(auth, a.owner!.username, 'another temporary 2')).resolves.toBeInstanceOf(Headers)
    await expect(signIn(auth, b.owner!.username, 'temporary password 1')).resolves.toBeInstanceOf(Headers)

    const rows = await auditOf(a.id)
    expect(rows.at(-1)).toMatchObject({ action: 'owner.reset-password', shopId: null, data: { ownerId: a.owner!.id } })
    expect(JSON.stringify(rows)).not.toContain('another temporary 2')
  })

  it('404 for an unknown shop; 404 for a shop without an owner', async () => {
    expect(await refusal(resetOwnerPassword(db, actor, '01900000-0000-7000-8000-000000000000', { password: 'another temporary 2' }))).toBe('404 NOT_FOUND')
    const shop = await createShop(db, actor, input())
    await db.delete(member).where(eq(member.organizationId, shop.id))
    expect(await refusal(resetOwnerPassword(db, actor, shop.id, { password: 'another temporary 2' }))).toBe('404 NOT_FOUND')
    // A staff member is not the owner.
    const staff = await createTestUser(db)
    await db.insert(member).values({ id: '01900000-0000-7000-8000-0000000000ab', organizationId: shop.id, userId: staff.userId, role: 'staff', createdAt: new Date() })
    expect((await getShop(db, shop.id)).owner).toBeNull()
    expect(await refusal(resetOwnerPassword(db, actor, shop.id, { password: 'another temporary 2' }))).toBe('404 NOT_FOUND')
    expect((await auditOf(shop.id)).map(row => row.action)).toEqual(['shop.create'])
  })

  it('never resets a super admin, even one with a membership row', async () => {
    const shop = await createShop(db, actor, input())
    await db.delete(member).where(eq(member.organizationId, shop.id))
    await db.insert(member).values({ id: '01900000-0000-7000-8000-0000000000aa', organizationId: shop.id, userId: actor.userId, role: 'owner', createdAt: new Date() })
    expect(await refusal(resetOwnerPassword(db, actor, shop.id, { password: 'another temporary 2' }))).toBe('404 NOT_FOUND')
    expect((await sessionUserOf(actor.userId)).mustChangePassword).toBe(false)
  })
})

describe('revokeOwnerSessions (spec §16: owner\'s phone lost)', () => {
  it('ends every session of that owner only; the password still works', async () => {
    const { a, b } = await twoShops()
    await revokeOwnerSessions(db, actor, a.id)
    expect(await sessionCount(a.owner!.id)).toBe(0)
    expect(await sessionCount(b.owner!.id)).toBe(2)
    await expect(signIn(auth, a.owner!.username, 'temporary password 1')).resolves.toBeInstanceOf(Headers)
    expect((await auditOf(a.id)).at(-1)).toMatchObject({ action: 'owner.revoke-sessions', data: { ownerId: a.owner!.id } })
  })

  it('404 for an unknown shop', async () => {
    expect(await refusal(revokeOwnerSessions(db, actor, '01900000-0000-7000-8000-000000000000'))).toBe('404 NOT_FOUND')
  })
})

describe('the platform never acts in a shop (spec §5)', () => {
  it('a signed-in super admin gets 403 NO_SHOP from every shop access check', async () => {
    await createShop(db, actor, input())
    const headers = await signIn(auth, (await sessionUserOf(actor.userId)).username!, 'a long enough password')
    const current = await auth.api.getSession({ headers })
    expect(await refusal(authorizeShop({ db, user: current!.user as never, permissions: { shop: ['read'] } }))).toBe('403 NO_SHOP')
  })
})
