import type { H3Event } from 'h3'
import { authorizePlatform, authorizeShop, authorizeSignedIn } from '#server/features/identity'
import type { PlatformActor, PlatformPermission, SessionUser, ShopActor, ShopPermission } from '#server/features/identity'
import { useDb } from './db'

/**
 * Access helpers for routes (spec §12, docs/server/security.md → Access helpers). Every route under
 * `/api/shop` and `/api/platform` calls exactly one of these first (server/tests/routes.test.ts);
 * each returns the actor the service receives. Decisions live in the identity feature.
 */

const requestIdOf = (event: H3Event) => event.context.requestId as string | undefined

/** The session's user, or `null` (Better Auth's session, read once per request by the module). */
export async function sessionUser(event: H3Event): Promise<SessionUser | null> {
  const session = await getUserSession(event)
  return (session?.user as SessionUser | undefined) ?? null
}

/** Any signed-in account: 401; 403 `PASSWORD_CHANGE_REQUIRED`. */
export async function requireSignedIn(event: H3Event): Promise<{ userId: string, requestId?: string }> {
  return { ...authorizeSignedIn(await sessionUser(event)), requestId: requestIdOf(event) }
}

/**
 * `/api/shop/**`: the user's shop, from their membership (never from the request), whose role must
 * grant every statement, e.g. `{ order: ['transition'] }`.
 */
export async function requireShopPermission(event: H3Event, permissions: ShopPermission): Promise<ShopActor> {
  return { ...await authorizeShop({ db: useDb(), user: await sessionUser(event), permissions }), requestId: requestIdOf(event) }
}

/** `/api/platform/**`: a super admin whose role grants every statement, e.g. `{ shop: ['suspend'] }`. */
export async function requirePlatformPermission(event: H3Event, permissions: PlatformPermission): Promise<PlatformActor> {
  return { ...authorizePlatform({ user: await sessionUser(event), permissions }), requestId: requestIdOf(event) }
}
