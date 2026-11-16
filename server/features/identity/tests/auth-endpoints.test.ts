import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authEndpointPath, isAllowedAuthEndpoint } from '#server/features/identity/auth-endpoints'
import { USERNAME_SIGN_IN_LIMIT } from '#server/features/identity/identity.auth'
import type { Db } from '#server/utils/batch'
import { createTestDb } from '#server/tests/support/db'
import { createOwner, createTestAuth, TEST_PASSWORD, TEST_SITE } from '#server/tests/support/auth'
import type { TestAuth } from '#server/tests/support/auth'

let db: Db
let auth: TestAuth

beforeEach(async () => {
  db = await createTestDb()
  auth = createTestAuth(db)
})

/** A browser's request to Better Auth, from an address. */
function request(path: string, options: { method?: string, body?: unknown, ip?: string } = {}) {
  const { method = 'POST', body, ip = '203.0.113.1' } = options
  return auth.handler(new Request(`${TEST_SITE}/api/auth${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'origin': TEST_SITE, 'cf-connecting-ip': ip },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  }))
}

describe('authEndpointPath', () => {
  it('reads the path after the base path', () => {
    expect(authEndpointPath(`${TEST_SITE}/api/auth/sign-in/username`, `${TEST_SITE}/api/auth`)).toBe('/sign-in/username')
    expect(authEndpointPath(`${TEST_SITE}/api/auth/get-session/`, `${TEST_SITE}/api/auth`)).toBe('/get-session')
    expect(authEndpointPath(`${TEST_SITE}/elsewhere`, `${TEST_SITE}/api/auth`)).toBeNull()
  })

  it('allows only the app\'s endpoints, spelled exactly', () => {
    for (const path of ['/get-session', '/sign-in/username', '/sign-out', '/change-password', '/list-sessions', '/revoke-other-sessions']) expect(isAllowedAuthEndpoint(path)).toBe(true)
    for (const path of ['/sign-in/email', '/sign-up/email', '/organization/create', '/SIGN-IN/USERNAME', '//get-session']) expect(isAllowedAuthEndpoint(path)).toBe(false)
  })
})

describe('Better Auth over HTTP (spec §5)', () => {
  it('blocks the organization, member, invitation and access-control endpoints with 403', async () => {
    for (const path of ['/organization/create', '/organization/add-member', '/organization/invite-member', '/organization/update-member-role', '/organization/list', '/organization/create-role']) {
      const response = await request(path, { body: { name: 'x', slug: 'x' } })
      expect(response.status, path).toBe(403)
      expect(await response.json()).toEqual({ code: 'FORBIDDEN', message: 'You don\'t have permission to do this.' })
    }
  })

  it('blocks sign-up, email sign-in and the admin plugin\'s endpoints', async () => {
    for (const path of ['/sign-up/email', '/sign-in/email', '/admin/create-user', '/admin/set-role', '/admin/impersonate-user', '/update-user']) {
      expect((await request(path)).status, path).toBe(403)
    }
  })

  it('serves the app\'s endpoints: sign-in by username, then the session', async () => {
    await createOwner(db, { username: 'sokha' })
    const signedIn = await request('/sign-in/username', { body: { username: 'sokha', password: TEST_PASSWORD } })
    expect(signedIn.status).toBe(200)
    const cookie = signedIn.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
    const current = await auth.handler(new Request(`${TEST_SITE}/api/auth/get-session`, { headers: { cookie } }))
    expect((await current.json()).user.username).toBe('sokha')
  })

  it('sets the session cookie HttpOnly, Secure and SameSite=Lax', async () => {
    await createOwner(db, { username: 'sokha' })
    const signedIn = await request('/sign-in/username', { body: { username: 'sokha', password: TEST_PASSWORD } })
    const cookie = signedIn.headers.getSetCookie().find(value => value.includes('session_token'))!
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/Secure/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
  })
})

describe('sign-in rate limits (spec §12)', () => {
  beforeEach(() => {
    auth = createTestAuth(db, { rateLimit: true })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.UTC(2026, 10, 16, 2, 0, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const tryPassword = (username: string, password: string, ip: string) => request('/sign-in/username', { body: { username, password }, ip })

  it('limit sign-ins per address', async () => {
    await createOwner(db, { username: 'sokha' })
    const statuses = []
    for (let i = 0; i < 6; i++) statuses.push((await tryPassword('sokha', 'wrong password', '198.51.100.7')).status)
    expect(statuses.slice(0, 5).every(status => status !== 429)).toBe(true)
    expect(statuses[5]).toBe(429)
  })

  it('limit sign-ins per username across addresses, even with the right password', async () => {
    await createOwner(db, { username: 'sokha' })
    for (let i = 0; i < USERNAME_SIGN_IN_LIMIT.max; i++) {
      expect((await tryPassword(i % 2 ? 'Sokha' : 'sokha', 'wrong password', `198.51.100.${i}`)).status).toBe(401)
    }
    const refused = await tryPassword('sokha', TEST_PASSWORD, '192.0.2.200')
    expect(refused.status).toBe(429)
    // Another username is not affected.
    await createOwner(db, { username: 'dara' })
    expect((await tryPassword('dara', TEST_PASSWORD, '192.0.2.201')).status).toBe(200)
  })

  it('let the username try again after the window', async () => {
    await createOwner(db, { username: 'sokha' })
    for (let i = 0; i < USERNAME_SIGN_IN_LIMIT.max; i++) await tryPassword('sokha', 'wrong password', `198.51.100.${i}`)
    vi.setSystemTime(Date.now() + USERNAME_SIGN_IN_LIMIT.window * 1000 + 1000)
    expect((await tryPassword('sokha', TEST_PASSWORD, '192.0.2.202')).status).toBe(200)
  })
})
