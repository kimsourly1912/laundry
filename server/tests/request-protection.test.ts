import { describe, expect, it } from 'vitest'
import { isTrustedOrigin, requestIdFrom } from '#server/utils/request-protection'
import type { OriginCheck } from '#server/utils/request-protection'

const site = 'https://laundry.angder.app'
const write = (overrides: Partial<OriginCheck>): OriginCheck => ({
  method: 'POST',
  path: '/api/shop/orders',
  origin: undefined,
  referer: undefined,
  requestOrigin: site,
  siteUrl: site,
  ...overrides,
})

describe('isTrustedOrigin', () => {
  it('accepts a write from the site itself, by Origin or by Referer', () => {
    expect(isTrustedOrigin(write({ origin: site }))).toBe(true)
    expect(isTrustedOrigin(write({ referer: `${site}/orders/new` }))).toBe(true)
  })

  it('refuses a write from another origin, a sibling subdomain, or with no origin at all', () => {
    expect(isTrustedOrigin(write({ origin: 'https://evil.example' }))).toBe(false)
    expect(isTrustedOrigin(write({ origin: 'https://angder.app' }))).toBe(false)
    expect(isTrustedOrigin(write({ origin: 'https://nuk.angder.app' }))).toBe(false)
    expect(isTrustedOrigin(write({}))).toBe(false)
    expect(isTrustedOrigin(write({ referer: 'not a url' }))).toBe(false)
  })

  it('prefers Origin over Referer', () => {
    expect(isTrustedOrigin(write({ origin: 'https://evil.example', referer: `${site}/` }))).toBe(false)
  })

  it('accepts the configured site URL when the request reached another origin (a proxy)', () => {
    expect(isTrustedOrigin(write({ requestOrigin: 'http://localhost:3000', origin: site }))).toBe(true)
  })

  it('checks only writes to our API: reads, pages, Better Auth and webhooks pass', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) expect(isTrustedOrigin(write({ method }))).toBe(true)
    expect(isTrustedOrigin(write({ path: '/sign-in' }))).toBe(true)
    expect(isTrustedOrigin(write({ path: '/api/auth/sign-in/username' }))).toBe(true)
    expect(isTrustedOrigin(write({ path: '/api/webhooks/telegram' }))).toBe(true)
    for (const method of ['PATCH', 'PUT', 'DELETE']) expect(isTrustedOrigin(write({ method }))).toBe(false)
  })
})

describe('requestIdFrom', () => {
  it('uses cf-ray when it is a short safe token, else the fallback', () => {
    expect(requestIdFrom('8e1f2a3b4c5d6e7f-SIN', () => 'new')).toBe('8e1f2a3b4c5d6e7f-SIN')
    expect(requestIdFrom(undefined, () => 'new')).toBe('new')
    expect(requestIdFrom('bad id\nwith newline', () => 'new')).toBe('new')
    expect(requestIdFrom('x'.repeat(65), () => 'new')).toBe('new')
  })
})
