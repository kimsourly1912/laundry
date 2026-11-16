import type { PlatformRole, ShopRole } from './identity.permissions'

/** The signed-in user as Better Auth's session returns it (the fields access decisions read). */
export interface SessionUser {
  id: string
  name?: string | null
  username?: string | null
  /** Better Auth stores roles comma-separated; ours only ever set one: `user` or `superadmin`. */
  role?: string | null
  banned?: boolean | null
  mustChangePassword?: boolean | null
}

/**
 * Who is acting in a shop, as `requireShopPermission` returns it. Services receive it and scope
 * every query to `shopId`, which comes from the membership, never from the request (spec T3).
 */
export interface ShopActor {
  userId: string
  shopId: string
  role: ShopRole
  /** Every `resource:action` the role grants. */
  statements: string[]
  /** The request, for the audit trail. */
  requestId?: string
}

/** Who is acting on the platform, as `requirePlatformPermission` returns it. Never acts in a shop. */
export interface PlatformActor {
  userId: string
  platformRole: Extract<PlatformRole, 'superadmin'>
  requestId?: string
}

/** `GET /api/me`: who is signed in, their shop (if any) and what they may do. */
export interface MeResponse {
  user: { id: string, name: string, username: string | null }
  mustChangePassword: boolean
  /** `superadmin` for the platform team, else `null`. */
  platformRole: 'superadmin' | null
  shop: { id: string, name: string, status: 'active' | 'suspended' } | null
  /** Granted `resource:action` statements: the shop's, or the platform's for a super admin. */
  statements: string[]
}
