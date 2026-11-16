import { eq } from 'drizzle-orm'
import { hashPassword } from 'better-auth/crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authorizeShop, resetPasswordStatements, revokeSessionsStatements, seedPlatformAdmin } from '#server/features/identity'
import type { SessionUser } from '#server/features/identity'
import { identityAuthOptions } from '#server/features/identity/identity.auth'
import { ADMIN_IDLE_MS, ADMIN_MAX_AGE_MS } from '#server/features/identity/identity.sessions'
import { session, user } from '#server/db/tables'
import { runBatch } from '#server/utils/batch'
import type { Db } from '#server/utils/batch'
import { createTestDb } from '#server/tests/support/db'
import { createOwner, createTestAuth, createTestUser, sessionHeaders, signIn, TEST_PASSWORD, TEST_SITE } from '#server/tests/support/auth'
import type { TestAuth } from '#server/tests/support/auth'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

// Our Better Auth configuration against the real migration (server/db/migrations).
let db: Db
let auth: TestAuth
let clock: number

beforeEach(async () => {
  db = await createTestDb()
  auth = createTestAuth(db)
  // Better Auth reads the time with `Date`; only `Date` is faked, so timers and the database work.
  clock = Date.UTC(2026, 10, 16, 2, 0, 0)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(clock)
})

afterEach(() => {
  vi.useRealTimers()
})

function advance(ms: number) {
  clock += ms
  vi.setSystemTime(clock)
}

const getSession = (headers: Headers) => auth.api.getSession({ headers })
const sessionCount = async (userId: string) => db.$count(session, eq(session.userId, userId))
const stale = () => new Error('stale')

describe('sign-in (spec P4)', () => {
  it('signs an owner in by username, ignoring case and spaces', async () => {
    const owner = await createOwner(db, { username: 'sokha' })
    const headers = await signIn(auth, ' Sokha ', TEST_PASSWORD)
    expect((await getSession(headers))?.user.id).toBe(owner.userId)
  })

  it('refuses a wrong password', async () => {
    await createOwner(db, { username: 'sokha' })
    await expect(signIn(auth, 'sokha', 'not the password')).rejects.toThrow()
  })

  it('signs in the seeded platform admin, still marked to change the password', async () => {
    const created = await seedPlatformAdmin({ db, username: 'admin', passwordHash: await hashPassword('a long admin password') })
    const signedIn = await getSession(await signIn(auth, 'admin', 'a long admin password'))
    expect(signedIn?.user).toMatchObject({ id: created.userId, role: 'superadmin', mustChangePassword: true })
  })

  it('has no sign-up: accounts come only from the platform (spec P1)', async () => {
    await expect(auth.api.signUpEmail({ body: { email: 'x@example.com', password: TEST_PASSWORD, name: 'X' } })).rejects.toThrow()
  })

  it('refuses a banned user', async () => {
    await createOwner(db, { username: 'banned', banned: true })
    await expect(signIn(auth, 'banned', TEST_PASSWORD)).rejects.toThrow()
  })

  it('trusts only the site origin', () => {
    expect(identityAuthOptions({ siteUrl: `${TEST_SITE}/some/path` }).trustedOrigins).toEqual([TEST_SITE])
    expect(identityAuthOptions().trustedOrigins).toEqual([])
  })
})

describe('owner sessions (spec T16): 30 days sliding, no cap', () => {
  it('start with 30 days', async () => {
    await createOwner(db, { username: 'sokha' })
    const current = await getSession(await signIn(auth, 'sokha', TEST_PASSWORD))
    expect(current!.session.expiresAt.getTime()).toBe(clock + 30 * DAY)
  })

  it('survive 29 days idle, and renew on use, keeping the same token', async () => {
    await createOwner(db, { username: 'sokha' })
    const headers = await signIn(auth, 'sokha', TEST_PASSWORD)
    const first = await getSession(headers)
    advance(29 * DAY)
    const renewed = await auth.api.getSession({ headers, returnHeaders: true })
    expect(renewed.response?.session.expiresAt.getTime()).toBe(clock + 30 * DAY)
    // The renewal extends the same session: the cookie keeps its value (spec §17).
    expect(renewed.response?.session.token).toBe(first!.session.token)
    expect(sessionHeaders(renewed.headers).get('cookie')).toBe(headers.get('cookie'))
  })

  it('renew at most once a day', async () => {
    await createOwner(db, { username: 'sokha' })
    const headers = await signIn(auth, 'sokha', TEST_PASSWORD)
    advance(12 * HOUR)
    expect((await getSession(headers))!.session.expiresAt.getTime()).toBe(clock - 12 * HOUR + 30 * DAY)
    advance(13 * HOUR)
    expect((await getSession(headers))!.session.expiresAt.getTime()).toBe(clock + 30 * DAY)
  })

  it('end after 30 days idle', async () => {
    await createOwner(db, { username: 'sokha' })
    const headers = await signIn(auth, 'sokha', TEST_PASSWORD)
    advance(30 * DAY + 1000)
    expect(await getSession(headers)).toBeNull()
  })

  it('have no absolute cap: used every 20 days, alive after 200', async () => {
    await createOwner(db, { username: 'sokha' })
    const headers = await signIn(auth, 'sokha', TEST_PASSWORD)
    for (let day = 0; day < 200; day += 20) {
      advance(20 * DAY)
      expect(await getSession(headers)).not.toBeNull()
    }
  })

  it('are separate per device: phone and tablet both stay signed in', async () => {
    const owner = await createOwner(db, { username: 'sokha' })
    const phone = await signIn(auth, 'sokha', TEST_PASSWORD)
    const tablet = await signIn(auth, 'sokha', TEST_PASSWORD)
    expect(await sessionCount(owner.userId)).toBe(2)
    expect(await getSession(phone)).not.toBeNull()
    expect(await getSession(tablet)).not.toBeNull()
  })
})

describe('super admin sessions (spec T16): 12 hours idle, 7 days at most', () => {
  async function signInAdmin() {
    await createTestUser(db, { username: 'admin', role: 'superadmin' })
    return signIn(auth, 'admin', TEST_PASSWORD)
  }

  it('start with 12 hours', async () => {
    const headers = await signInAdmin()
    expect((await getSession(headers))!.session.expiresAt.getTime()).toBe(clock + ADMIN_IDLE_MS)
  })

  it('renew to 12 hours from each use', async () => {
    const headers = await signInAdmin()
    advance(11 * HOUR)
    expect((await getSession(headers))!.session.expiresAt.getTime()).toBe(clock + ADMIN_IDLE_MS)
  })

  it('end after 12 hours idle', async () => {
    const headers = await signInAdmin()
    advance(12 * HOUR + 1000)
    expect(await getSession(headers)).toBeNull()
  })

  it('end 7 days after sign-in, however often used', async () => {
    const headers = await signInAdmin()
    const signedInAt = clock
    while (clock + 10 * HOUR < signedInAt + ADMIN_MAX_AGE_MS) {
      advance(10 * HOUR)
      const current = await getSession(headers)
      expect(current!.session.expiresAt.getTime()).toBeLessThanOrEqual(signedInAt + ADMIN_MAX_AGE_MS)
    }
    vi.setSystemTime(clock = signedInAt + ADMIN_MAX_AGE_MS + 1000)
    expect(await getSession(headers)).toBeNull()
  })
})

describe('revocation (spec §12): each takes effect on the next request', () => {
  it('a password change ends the other sessions, keeps this one, and clears a temporary password', async () => {
    const owner = await createOwner(db, { username: 'sokha', mustChangePassword: true })
    const phone = await signIn(auth, 'sokha', TEST_PASSWORD)
    const tablet = await signIn(auth, 'sokha', TEST_PASSWORD)
    // Not asked to revoke: the server does it anyway.
    await auth.api.changePassword({ body: { currentPassword: TEST_PASSWORD, newPassword: 'a brand new password', revokeOtherSessions: false }, headers: phone })
    expect(await getSession(phone)).not.toBeNull()
    expect(await getSession(tablet)).toBeNull()
    expect(await sessionCount(owner.userId)).toBe(1)
    const [row] = await db.select({ mustChangePassword: user.mustChangePassword }).from(user).where(eq(user.id, owner.userId))
    expect(row?.mustChangePassword).toBe(false)
  })

  it('a refused password change keeps the temporary password and every session', async () => {
    const owner = await createOwner(db, { username: 'sokha', mustChangePassword: true })
    const phone = await signIn(auth, 'sokha', TEST_PASSWORD)
    await signIn(auth, 'sokha', TEST_PASSWORD)
    await expect(auth.api.changePassword({ body: { currentPassword: 'wrong password', newPassword: 'a brand new password' }, headers: phone })).rejects.toThrow()
    expect(await sessionCount(owner.userId)).toBe(2)
    const [row] = await db.select({ mustChangePassword: user.mustChangePassword }).from(user).where(eq(user.id, owner.userId))
    expect(row?.mustChangePassword).toBe(true)
  })

  it('a new password needs at least 10 characters', async () => {
    await createOwner(db, { username: 'sokha' })
    const headers = await signIn(auth, 'sokha', TEST_PASSWORD)
    await expect(auth.api.changePassword({ body: { currentPassword: TEST_PASSWORD, newPassword: 'short1234' }, headers })).rejects.toThrow()
  })

  it('"sign out other devices" ends the others and keeps this one', async () => {
    await createOwner(db, { username: 'sokha' })
    const phone = await signIn(auth, 'sokha', TEST_PASSWORD)
    const tablet = await signIn(auth, 'sokha', TEST_PASSWORD)
    await auth.api.revokeOtherSessions({ headers: phone })
    expect(await getSession(phone)).not.toBeNull()
    expect(await getSession(tablet)).toBeNull()
  })

  it('the platform\'s "sign owner out everywhere" ends every session', async () => {
    const owner = await createOwner(db, { username: 'sokha' })
    const phone = await signIn(auth, 'sokha', TEST_PASSWORD)
    const tablet = await signIn(auth, 'sokha', TEST_PASSWORD)
    await runBatch(db, revokeSessionsStatements(db, owner.userId), stale)
    expect(await getSession(phone)).toBeNull()
    expect(await getSession(tablet)).toBeNull()
  })

  it('the platform\'s password reset ends every session and asks for a new password', async () => {
    const owner = await createOwner(db, { username: 'sokha' })
    const phone = await signIn(auth, 'sokha', TEST_PASSWORD)
    await runBatch(db, resetPasswordStatements(db, { userId: owner.userId, passwordHash: await hashPassword('temporary password 2'), now: new Date() }), stale)
    expect(await getSession(phone)).toBeNull()
    await expect(signIn(auth, 'sokha', TEST_PASSWORD)).rejects.toThrow()
    const again = await getSession(await signIn(auth, 'sokha', 'temporary password 2'))
    expect(again?.user.mustChangePassword).toBe(true)
  })

  it('a banned user\'s session no longer opens the shop API', async () => {
    const owner = await createOwner(db, { username: 'sokha' })
    const headers = await signIn(auth, 'sokha', TEST_PASSWORD)
    await db.update(user).set({ banned: true }).where(eq(user.id, owner.userId))
    const current = await getSession(headers)
    await expect(authorizeShop({ db, user: (current?.user ?? null) as SessionUser | null, permissions: { order: ['read'] } })).rejects.toMatchObject({ statusCode: 401 })
  })

  it('a suspended shop keeps the session but refuses the shop API', async () => {
    const owner = await createOwner(db, { username: 'sokha', status: 'suspended' })
    const current = await getSession(await signIn(auth, 'sokha', TEST_PASSWORD))
    expect(current).not.toBeNull()
    await expect(authorizeShop({ db, user: current!.user as SessionUser, permissions: { order: ['read'] } })).rejects.toMatchObject({ statusCode: 403, data: { code: 'SHOP_SUSPENDED' } })
    expect(await sessionCount(owner.userId)).toBe(1)
  })
})
