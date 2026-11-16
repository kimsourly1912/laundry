import { hashPassword } from 'better-auth/crypto'
import type { ShopOwner } from '#shared/contracts/platform-shops'
import type { Db, Statement } from '#server/utils/batch'
import { readInChunks, runBatch } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { shopStatus } from '#server/features/shops'
import { forbidden, noShop, passwordChangeRequired, platformAdminExists, shopSuspended, slugTaken, unauthenticated, unknownStatement, usernameTaken } from './identity.errors'
import { grantedPlatformStatements, grantedShopStatements, isKnownPermission, platformRoles, platformStatements, shopRoles, shopStatements } from './identity.permissions'
import type { PlatformPermission, ShopPermission, ShopRole } from './identity.permissions'
import * as repo from './identity.repository'
import { normalizeUsername, placeholderEmail } from './identity.rules'
import { isSuperAdmin } from './identity.sessions'
import type { MeResponse, PlatformActor, SessionUser, ShopActor } from './identity.types'

/**
 * Access decisions (spec §12 → Access helpers). `server/utils/access.ts` reads the session and
 * calls these; everything here is plain data in, actor out (or an error thrown), so it's tested
 * without Nitro.
 */

/** A session user who may use the API: present, not banned, not on a temporary password. */
function signedIn(user: SessionUser | null | undefined): SessionUser {
  if (!user || user.banned) throw unauthenticated()
  if (user.mustChangePassword) throw passwordChangeRequired()
  return user
}

const shopRoleOf = (role: string): ShopRole | undefined => (role in shopRoles ? role as ShopRole : undefined)

/** `/api/me` only: any session user, also on a temporary password (the app then asks for a new one). */
export function requireSessionUser(user: SessionUser | null | undefined): SessionUser {
  if (!user || user.banned) throw unauthenticated()
  return user
}

/** Any signed-in account (`requireSignedIn`): 401, or 403 `PASSWORD_CHANGE_REQUIRED`. */
export function authorizeSignedIn(user: SessionUser | null | undefined): { userId: string } {
  return { userId: signedIn(user).id }
}

interface ShopAccess {
  db: Db
  user: SessionUser | null | undefined
  permissions: ShopPermission
}

/**
 * `/api/shop/**` (spec §12): refuses in this order with 401; 403 `PASSWORD_CHANGE_REQUIRED`;
 * 403 `NO_SHOP` (no membership: super admins too); 403 `SHOP_SUSPENDED`; 403 `FORBIDDEN`.
 */
export async function authorizeShop(access: ShopAccess): Promise<ShopActor> {
  const { db, user, permissions } = access
  if (!isKnownPermission(shopStatements, permissions)) throw unknownStatement(permissions)
  const { id, role: platformRole } = signedIn(user)
  // The platform team never acts in a shop (spec §5), even if a membership row said otherwise.
  if (isSuperAdmin(platformRole)) throw noShop()
  const membership = await repo.findMembership(db, id)
  const role = membership && shopRoleOf(membership.role)
  if (!membership || !role) throw noShop()
  const status = await shopStatus(db, membership.shopId)
  if (!status) throw noShop()
  if (status !== 'active') throw shopSuspended()
  if (!shopRoles[role].authorize(permissions as never).success) throw forbidden()
  return { userId: id, shopId: membership.shopId, role, statements: grantedShopStatements(role) }
}

interface PlatformAccess {
  user: SessionUser | null | undefined
  permissions: PlatformPermission
}

/**
 * `/api/platform/**` (spec §12): 401 (also when the super admin's 12 h idle time or 7-day cap
 * passed: Better Auth no longer returns the session, identity.sessions.ts); 403
 * `PASSWORD_CHANGE_REQUIRED`; 403 `FORBIDDEN`.
 */
export function authorizePlatform(access: PlatformAccess): PlatformActor {
  const { user, permissions } = access
  if (!isKnownPermission(platformStatements, permissions)) throw unknownStatement(permissions)
  const { id, role } = signedIn(user)
  if (!isSuperAdmin(role) || !platformRoles.superadmin.authorize(permissions as never).success) throw forbidden()
  return { userId: id, platformRole: 'superadmin' }
}

/** `GET /api/me` (spec §9): the user, their shop (if any) and the statements the app may show. */
export async function me(db: Db, sessionUser: SessionUser | null | undefined): Promise<MeResponse> {
  const user = requireSessionUser(sessionUser)
  const base = { id: user.id, name: user.name ?? '', username: user.username ?? null }
  const mustChangePassword = Boolean(user.mustChangePassword)
  if (isSuperAdmin(user.role)) {
    return { user: base, mustChangePassword, platformRole: 'superadmin', shop: null, statements: grantedPlatformStatements('superadmin') }
  }
  const membership = await repo.findMembership(db, user.id)
  const role = membership && shopRoleOf(membership.role)
  const status = membership && await shopStatus(db, membership.shopId)
  if (!membership || !role || !status) return { user: base, mustChangePassword, platformRole: null, shop: null, statements: [] }
  // A suspended shop grants nothing: every shop route refuses (spec §5); the app shows the notice.
  return {
    user: base,
    mustChangePassword,
    platformRole: null,
    shop: { id: membership.shopId, name: membership.shopName, status },
    statements: status === 'active' ? grantedShopStatements(role) : [],
  }
}

// --- Revocation (spec §12): statements for the caller's own batch (with its audit row) ---

/**
 * Ends every session of the user ("sign owner out everywhere", a lost phone). Effective on the
 * user's next request: the session row is gone.
 */
export function revokeSessionsStatements(db: Db, userId: string): Statement[] {
  return [repo.deleteSessionsStatement(db, userId)]
}

interface PasswordResetInput {
  userId: string
  /** The temporary password, hashed with Better Auth's `hashPassword`. */
  passwordHash: string
  now: Date
}

/**
 * The platform resets an owner's password (spec P4, §12): a temporary password to change at the
 * next sign-in, and **every** session ended.
 */
export function resetPasswordStatements(db: Db, reset: PasswordResetInput): Statement[] {
  return [...repo.resetPasswordStatements(db, reset), repo.deleteSessionsStatement(db, reset.userId)]
}

// --- The first platform admin (spec §14) ---

interface PlatformAdminSeed {
  db: Db
  username: string
  /** Hashed with Better Auth's `hashPassword` (never stored in clear). */
  passwordHash: string
  now?: Date
}

/**
 * Creates the first super admin, on a temporary password. Refuses with 409
 * `PLATFORM_ADMIN_EXISTS` when any super admin exists: checked inside the batch, so two runs at
 * once can't both create one.
 */
export async function seedPlatformAdmin(seed: PlatformAdminSeed): Promise<{ userId: string, username: string }> {
  const { db, passwordHash, now = new Date() } = seed
  const username = normalizeUsername(seed.username)
  const userId = newId()
  await runBatch(db, [
    repo.requireNoPlatformAdmin(db),
    ...repo.insertPlatformAdminStatements(db, { userId, accountId: newId(), username, name: 'Platform admin', email: placeholderEmail(userId), passwordHash, now }),
  ], platformAdminExists)
  return { userId, username }
}

// --- Shops and their owners (spec P1: only the platform creates them, M1.5) ---

interface ShopNames {
  username: string
  slug: string
}

/**
 * Refuses with 409 `USERNAME_TAKEN` or `SLUG_TAKEN`. Advisory before the batch (the unique indexes
 * decide); the caller asks again after a unique violation, to name the field.
 */
export async function requireShopNamesAvailable(db: Db, names: ShopNames): Promise<void> {
  const { username, slug } = names
  if (await repo.usernameExists(db, normalizeUsername(username))) throw usernameTaken()
  if (await repo.slugExists(db, slug)) throw slugTaken()
}

interface NewShopAndOwner {
  shopId: string
  name: string
  slug: string
  owner: { name: string, username: string, password: string }
  now: Date
}

/**
 * A shop's organization and its owner (on the temporary password, hashed here), for the caller's
 * batch with the shop's settings and audit row. Checks the names first.
 */
export async function newShopStatements(db: Db, shop: NewShopAndOwner): Promise<Statement[]> {
  const { shopId, name, slug, owner, now } = shop
  const username = normalizeUsername(owner.username)
  await requireShopNamesAvailable(db, { username, slug })
  const userId = newId()
  return [
    repo.insertOrganizationStatement(db, { shopId, name, slug, now }),
    ...repo.insertOwnerStatements(db, { shopId, userId, accountId: newId(), memberId: newId(), username, name: owner.name, email: placeholderEmail(userId), passwordHash: await hashPassword(owner.password), now }),
  ]
}

/** Renames the shop (its organization), for the caller's versioned batch. */
export function renameShopStatement(db: Db, shopId: string, name: string): Statement {
  return repo.renameOrganizationStatement(db, shopId, name)
}

const toShopOwner = (row: repo.ShopOwnerRow): ShopOwner => ({ id: row.id, name: row.name, username: row.username ?? '', mustChangePassword: Boolean(row.mustChangePassword) })

/** The owner of each shop, by shop id; a shop without one is missing from the map. */
export async function shopOwners(db: Db, shopIds: string[]): Promise<Map<string, ShopOwner>> {
  const rows = await readInChunks(shopIds, ids => repo.findShopOwners(db, ids))
  return new Map(rows.map(row => [row.shopId, toShopOwner(row)]))
}

/** The shop's owner, or `undefined`. */
export async function shopOwner(db: Db, shopId: string): Promise<ShopOwner | undefined> {
  return (await shopOwners(db, [shopId])).get(shopId)
}

interface OwnerPasswordReset {
  userId: string
  /** The new temporary password, in clear: hashed here. */
  password: string
  now: Date
}

/** `resetPasswordStatements` from a password in clear (the platform's reset form). */
export async function ownerPasswordResetStatements(db: Db, reset: OwnerPasswordReset): Promise<Statement[]> {
  const { userId, password, now } = reset
  return resetPasswordStatements(db, { userId, passwordHash: await hashPassword(password), now })
}
