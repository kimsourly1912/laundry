import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { createShopSchema, resetOwnerPasswordSchema, shopListQuerySchema, updateShopSchema } from '#shared/contracts/platform-shops'

// The platform shop contracts (shared/contracts/platform-shops.ts): what the routes accept.

const valid = { name: ' Sokha Laundry ', slug: ' Sokha-Laundry ', owner: { name: 'Sokha', username: ' Sokha.Chan ', password: 'temporary password 1' } }
const issuesOf = (schema: v.GenericSchema, input: unknown) => {
  const result = v.safeParse(schema, input)
  return result.success ? [] : result.issues.map(issue => v.getDotPath(issue) ?? '')
}

describe('createShopSchema', () => {
  it('trims names, and lowercases the short name and the username (one spelling, D15)', () => {
    expect(v.parse(createShopSchema, valid)).toEqual({ name: 'Sokha Laundry', slug: 'sokha-laundry', owner: { name: 'Sokha', username: 'sokha.chan', password: 'temporary password 1' } })
  })

  it('keeps the password as typed', () => {
    expect(v.parse(createShopSchema, { ...valid, owner: { ...valid.owner, password: ' spaced password ' } }).owner.password).toBe(' spaced password ')
  })

  it('refuses unknown fields: a shop id, a role or a status is never taken from the client', () => {
    expect(issuesOf(createShopSchema, { ...valid, id: 'x' })).toContain('id')
    expect(issuesOf(createShopSchema, { ...valid, status: 'suspended' })).toContain('status')
    expect(issuesOf(createShopSchema, { ...valid, owner: { ...valid.owner, role: 'superadmin' } })).toContain('owner.role')
  })

  it.each([
    ['a short password', { owner: { ...valid.owner, password: 'short' } }, 'owner.password'],
    ['a username with other characters', { owner: { ...valid.owner, username: 'sokha chan' } }, 'owner.username'],
    ['a two-letter username', { owner: { ...valid.owner, username: 'so' } }, 'owner.username'],
    ['a short name with spaces', { slug: 'sokha laundry' }, 'slug'],
    ['a short name with a double dash', { slug: 'sokha--laundry' }, 'slug'],
    ['an empty shop name', { name: '   ' }, 'name'],
  ])('refuses %s', (_case, change, path) => {
    expect(issuesOf(createShopSchema, { ...valid, ...change })).toContain(path)
  })
})

describe('the other platform shop contracts', () => {
  it('updateShopSchema needs the version', () => {
    expect(issuesOf(updateShopSchema, { name: 'X' })).toContain('version')
    expect(issuesOf(updateShopSchema, { version: 0, name: 'X' })).toContain('version')
  })

  it('resetOwnerPasswordSchema applies the password rules', () => {
    expect(issuesOf(resetOwnerPasswordSchema, { password: 'short' })).toContain('password')
  })

  it('shopListQuerySchema: page defaults, empty filters are absent, unknown status refused', () => {
    expect(v.parse(shopListQuerySchema, { status: '', search: '' })).toEqual({ page: 1, pageSize: 20, status: undefined, search: undefined })
    expect(v.parse(shopListQuerySchema, { page: '2', pageSize: '50', status: 'suspended', search: ' wash ' })).toEqual({ page: 2, pageSize: 50, status: 'suspended', search: 'wash' })
    expect(issuesOf(shopListQuerySchema, { status: 'deleted' })).toContain('status')
    expect(issuesOf(shopListQuerySchema, { pageSize: '1000' })).toContain('pageSize')
  })
})
