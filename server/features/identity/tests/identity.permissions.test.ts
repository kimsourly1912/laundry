import { describe, expect, it } from 'vitest'
import { ASSIGNABLE_SHOP_ROLES, grantedPlatformStatements, grantedShopStatements, isKnownPermission, platformStatements, shopStatements } from '#server/features/identity/identity.permissions'

describe('shop roles (spec §5)', () => {
  it('give the owner every shop statement', () => {
    expect(grantedShopStatements('owner').sort()).toEqual([
      'customer:anonymize', 'customer:read', 'customer:write',
      'order:cancel', 'order:create', 'order:read', 'order:transition', 'order:update',
      'payment:record', 'price:read', 'price:write', 'report:read', 'shop:read', 'shop:update', 'ticket:bind',
    ])
  })

  it('give staff the counter work only: no settings, prices, anonymize, cancel or reports', () => {
    const staff = grantedShopStatements('staff')
    expect(staff).toEqual(expect.arrayContaining(['order:transition', 'payment:record', 'customer:write', 'ticket:bind', 'price:read']))
    for (const statement of ['shop:update', 'price:write', 'customer:anonymize', 'order:cancel', 'report:read']) expect(staff).not.toContain(statement)
  })

  it('never grant Better Auth\'s own organization statements', () => {
    for (const role of ['owner', 'staff'] as const) {
      expect(grantedShopStatements(role).some(statement => /^(organization|member|invitation|team|ac):/.test(statement))).toBe(false)
    }
  })

  it('let only owners be assigned in Phase 1 (spec P3)', () => {
    expect(ASSIGNABLE_SHOP_ROLES).toEqual(['owner'])
  })
})

describe('platform roles', () => {
  it('give the super admin the platform statements and nothing of Better Auth\'s admin endpoints', () => {
    expect(grantedPlatformStatements('superadmin').sort()).toEqual([
      'owner:create', 'owner:reset-password', 'owner:revoke-sessions',
      'shop:create', 'shop:read', 'shop:suspend', 'shop:update',
      'template:read', 'template:write',
      'ticketBatch:create', 'ticketBatch:read', 'ticketBatch:void',
    ])
    expect(grantedPlatformStatements('user')).toEqual([])
  })
})

describe('isKnownPermission', () => {
  it('accepts known statements and refuses unknown resources or actions', () => {
    expect(isKnownPermission(shopStatements, { order: ['transition'] })).toBe(true)
    expect(isKnownPermission(shopStatements, { order: ['transit'] })).toBe(false)
    expect(isKnownPermission(shopStatements, { orders: ['read'] })).toBe(false)
    expect(isKnownPermission(platformStatements, { shop: ['suspend'] })).toBe(true)
  })
})
