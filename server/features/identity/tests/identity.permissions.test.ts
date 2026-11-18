import { describe, expect, it } from 'vitest'
import { ASSIGNABLE_SHOP_ROLES, grantedPlatformStatements, grantedShopStatements, isKnownPermission, platformStatements, shopStatements } from '#server/features/identity/identity.permissions'

describe('shop roles (spec §5)', () => {
  it('give the owner the shop\'s settings, its templates and its orders (plan step 3)', () => {
    expect(grantedShopStatements('owner').sort()).toEqual(['order:cancel', 'order:create', 'order:pay', 'order:pick-up', 'order:read', 'shop:read', 'shop:update', 'template:read'])
  })

  it('give staff the counter: orders, payment and pickup, but no cancel and no settings changes', () => {
    expect(grantedShopStatements('staff').sort()).toEqual(['order:create', 'order:pay', 'order:pick-up', 'order:read', 'shop:read', 'template:read'])
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
    ])
    expect(grantedPlatformStatements('user')).toEqual([])
  })
})

describe('isKnownPermission', () => {
  it('accepts known statements and refuses unknown resources or actions', () => {
    expect(isKnownPermission(shopStatements, { shop: ['update'] })).toBe(true)
    expect(isKnownPermission(shopStatements, { shop: ['updates'] })).toBe(false)
    expect(isKnownPermission(shopStatements, { shops: ['read'] })).toBe(false)
    expect(isKnownPermission(platformStatements, { shop: ['suspend'] })).toBe(true)
  })
})
