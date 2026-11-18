import { createAccessControl } from 'better-auth/plugins/access'
import { defaultStatements as adminPluginStatements } from 'better-auth/plugins/admin/access'
import { defaultStatements as organizationPluginStatements } from 'better-auth/plugins/organization/access'

/**
 * Who may do what (spec §5, docs/server/security.md → Roles and statements). Defined once here;
 * routes check **statements**, never role names. Exact match, default deny.
 *
 * Two layers:
 * - **shop** roles on the membership (`organization` plugin: a shop is an organization): `owner`,
 *   and `staff` (in the map, not assignable until Phase 2, spec P3);
 * - **platform** roles on the user (`admin` plugin): `user` (everyone: no platform statement) and
 *   `superadmin` (the platform team: shops and owners, never a shop's data).
 */

// --- Shop (organization plugin) ---

export const shopStatements = {
  // Better Auth's own organization endpoints (members, invitations, teams, access control): never
  // used, and closed over HTTP (auth-endpoints.ts). Listed so no role gets them by accident.
  ...organizationPluginStatements,
  shop: ['read', 'update'],
  // The owner portal (plan step 3): the attached templates an order is filled on, and the orders.
  template: ['read'],
  order: ['create', 'read'],
} as const

export const shopAc = createAccessControl(shopStatements)

export const shopRoles = {
  owner: shopAc.newRole({
    shop: ['read', 'update'],
    template: ['read'],
    order: ['create', 'read'],
  }),
  // Staff take orders at the counter too (spec P3: not assignable until Phase 2).
  staff: shopAc.newRole({
    shop: ['read'],
    template: ['read'],
    order: ['create', 'read'],
  }),
}

export type ShopRole = keyof typeof shopRoles
/** Roles that may be given today (spec P3: staff from Phase 2). */
export const ASSIGNABLE_SHOP_ROLES: readonly ShopRole[] = ['owner']

// --- Platform (admin plugin) ---

export const platformStatements = {
  // Better Auth's own admin endpoints (create user, set role, ban, impersonate…): granted to nobody.
  // The platform changes accounts through our routes, audited in the same batch (M1.5).
  ...adminPluginStatements,
  shop: ['create', 'read', 'update', 'suspend'],
  owner: ['create', 'reset-password', 'revoke-sessions'],
  // Slip templates, designed in the studio and attached to shops (D31; plan S1, step 2).
  template: ['read', 'write'],
} as const

export const platformAc = createAccessControl(platformStatements)

export const platformRoles = {
  user: platformAc.newRole({}),
  superadmin: platformAc.newRole({
    shop: ['create', 'read', 'update', 'suspend'],
    owner: ['create', 'reset-password', 'revoke-sessions'],
    template: ['read', 'write'],
  }),
}

export type PlatformRole = keyof typeof platformRoles

type Actions<S> = { [K in keyof S]?: S[K] extends readonly (infer A)[] ? A[] : never }
/** A permission request on the shop layer, e.g. `{ order: ['transition'] }`. */
export type ShopPermission = Actions<Omit<typeof shopStatements, keyof typeof organizationPluginStatements>>
/** A permission request on the platform layer, e.g. `{ shop: ['suspend'] }`. */
export type PlatformPermission = Actions<Omit<typeof platformStatements, keyof typeof adminPluginStatements>>

/** Our own statements (Better Auth's are never granted), as `resource:action` strings. */
function ownStatements(statements: Record<string, readonly string[]>, plugin: Record<string, readonly string[]>): [string, string][] {
  return Object.entries(statements)
    .filter(([resource]) => !(resource in plugin))
    .flatMap(([resource, actions]) => actions.map(action => [resource, action] as [string, string]))
}

/** Every `resource:action` the shop role grants, for the app to show or hide actions (`/api/me`). */
export function grantedShopStatements(role: ShopRole): string[] {
  return ownStatements(shopStatements, organizationPluginStatements)
    .filter(([resource, action]) => shopRoles[role].authorize({ [resource]: [action] } as never).success)
    .map(([resource, action]) => `${resource}:${action}`)
}

/** Every `resource:action` the platform role grants. */
export function grantedPlatformStatements(role: PlatformRole): string[] {
  return ownStatements(platformStatements, adminPluginStatements)
    .filter(([resource, action]) => platformRoles[role].authorize({ [resource]: [action] } as never).success)
    .map(([resource, action]) => `${resource}:${action}`)
}

/**
 * Whether the request names only known statements. An unknown one is a bug in the route (a typo,
 * a removed action), not a "no": the access helpers throw an internal error for it (spec §5).
 */
export function isKnownPermission(statements: Record<string, readonly string[]>, request: Record<string, readonly string[] | undefined>): boolean {
  return Object.entries(request).every(([resource, actions]) =>
    resource in statements && (actions ?? []).every(action => statements[resource]!.includes(action)))
}
