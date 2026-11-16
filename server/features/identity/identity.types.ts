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

export type { MeResponse } from '#shared/contracts/identity'
