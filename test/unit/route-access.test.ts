import { describe, expect, it } from 'vitest'
import type { MeResponse } from '#shared/contracts/identity'
import { accessRedirect, homePath } from '~/utils/route-access'
import { safeRedirect } from '~/utils/redirect'

// Which page a session may see (app/utils/route-access.ts, spec §4 and §10).

const owner = (extra: Partial<MeResponse> = {}): MeResponse => ({
  user: { id: 'u1', name: 'Sokha', username: 'sokha' },
  mustChangePassword: false,
  platformRole: null,
  shop: { id: 's1', name: 'Sokha Laundry', status: 'active' },
  statements: ['shop:read', 'order:read'],
  ...extra,
})
const admin = (extra: Partial<MeResponse> = {}): MeResponse => ({ ...owner(), platformRole: 'superadmin', shop: null, statements: ['shop:read', 'shop:create'], ...extra })
const to = (path: string, meta: Record<string, unknown> = {}, query: Record<string, unknown> = {}) => ({ path, fullPath: path, meta, query })

describe('homePath', () => {
  it('the platform\'s shops, an active shop\'s Today, or the notice', () => {
    expect(homePath(admin())).toBe('/platform/shops')
    expect(homePath(owner())).toBe('/')
    expect(homePath(owner({ shop: { id: 's1', name: 'X', status: 'suspended' } }))).toBe('/unavailable')
    expect(homePath(owner({ shop: null }))).toBe('/unavailable')
  })
})

describe('accessRedirect', () => {
  it('signed out: sign-in, remembering the page (but not the bare home)', () => {
    expect(accessRedirect(null, to('/platform/shops'))).toEqual({ path: '/sign-in', query: { redirect: '/platform/shops' } })
    expect(accessRedirect(null, to('/'))).toEqual({ path: '/sign-in', query: {} })
    expect(accessRedirect(null, to('/sign-in', { public: true }))).toBeUndefined()
  })

  it('signed in on sign-in: the remembered page if it\'s on this site, else home', () => {
    expect(accessRedirect(owner(), to('/sign-in', { public: true }, { redirect: '/account' }))).toBe('/account')
    expect(accessRedirect(owner(), to('/sign-in', { public: true }, { redirect: 'https://evil.example' }))).toBe('/')
    expect(accessRedirect(admin(), to('/sign-in', { public: true }))).toBe('/platform/shops')
  })

  it('a temporary password: only the change-password page, remembering where to go next', () => {
    const me = owner({ mustChangePassword: true })
    expect(accessRedirect(me, to('/account'))).toEqual({ path: '/change-password', query: { redirect: '/account' } })
    expect(accessRedirect(me, to('/', { area: 'shop' }))).toEqual({ path: '/change-password', query: { redirect: '/' } })
    expect(accessRedirect(me, to('/change-password'))).toBeUndefined()
  })

  it('the platform\'s pages: the super admin only', () => {
    expect(accessRedirect(owner(), to('/platform/shops', { area: 'platform' }))).toBe('/')
    expect(accessRedirect(admin(), to('/platform/shops', { area: 'platform' }))).toBeUndefined()
  })

  it('a shop\'s pages: an active shop\'s member only; never the super admin', () => {
    expect(accessRedirect(owner(), to('/', { area: 'shop' }))).toBeUndefined()
    expect(accessRedirect(admin(), to('/', { area: 'shop' }))).toBe('/platform/shops')
    // Even if a session said the super admin had a shop (the server never does, D19).
    expect(accessRedirect(admin({ shop: { id: 's1', name: 'X', status: 'active' } }), to('/', { area: 'shop' }))).toBe('/platform/shops')
    expect(accessRedirect(owner({ shop: { id: 's1', name: 'X', status: 'suspended' } }), to('/', { area: 'shop' }))).toBe('/unavailable')
    expect(accessRedirect(owner({ shop: null }), to('/', { area: 'shop' }))).toBe('/unavailable')
  })

  it('a page\'s statement: granted, or home', () => {
    expect(accessRedirect(admin(), to('/platform/shops/new', { area: 'platform', permission: 'shop:create' }))).toBeUndefined()
    expect(accessRedirect(admin({ statements: ['shop:read'] }), to('/platform/shops/new', { area: 'platform', permission: 'shop:create' }))).toBe('/platform/shops')
  })

  it('any signed-in page without an area (account, the notice)', () => {
    expect(accessRedirect(owner({ shop: null }), to('/unavailable'))).toBeUndefined()
    expect(accessRedirect(admin(), to('/account'))).toBeUndefined()
  })
})

describe('safeRedirect', () => {
  it.each([
    ['/platform/shops?status=active', '/platform/shops?status=active'],
    ['https://evil.example', undefined],
    ['//evil.example', undefined],
    ['/\\evil.example', undefined],
    ['javascript:alert(1)', undefined],
    [['/a', '/b'], undefined],
    [undefined, undefined],
  ])('%j → %j', (value, expected) => {
    expect(safeRedirect(value)).toBe(expected)
  })
})
