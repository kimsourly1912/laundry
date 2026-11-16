import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import type { Db, Statement } from '#server/utils/batch'
import { requireCount } from '#server/utils/batch'
import { firstRow } from '#server/utils/query'
import { account, member, organization, session, user } from '#server/db/tables'

// --- Reads ---

export interface MembershipRow {
  shopId: string
  shopName: string
  role: string
}

/** The user's one shop membership (spec P2: at most one, `member_user_id_unique`). */
export function findMembership(db: Db, userId: string): Promise<MembershipRow | undefined> {
  return firstRow(db
    .select({ shopId: member.organizationId, shopName: organization.name, role: member.role })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId)))
}

export interface ShopOwnerRow {
  shopId: string
  id: string
  name: string
  username: string | null
  mustChangePassword: boolean | null
}

/**
 * The owners of these shops (one each, spec P2). Never a super admin: they are never members, and
 * the role check keeps it so even if a row said otherwise. Pass at most `IDS_PER_STATEMENT` ids.
 */
export function findShopOwners(db: Db, shopIds: string[]): Promise<ShopOwnerRow[]> {
  return db
    .select({ shopId: member.organizationId, id: user.id, name: user.name, username: user.username, mustChangePassword: user.mustChangePassword })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(inArray(member.organizationId, shopIds), eq(member.role, 'owner'), ne(sql`coalesce(${user.role}, '')`, 'superadmin')))
}

/** Whether an account has this (normalized) username. */
export async function usernameExists(db: Db, username: string): Promise<boolean> {
  return Boolean(await firstRow(db.select({ id: user.id }).from(user).where(eq(user.username, username))))
}

/** Whether a shop has this short name. */
export async function slugExists(db: Db, slug: string): Promise<boolean> {
  return Boolean(await firstRow(db.select({ id: organization.id }).from(organization).where(eq(organization.slug, slug))))
}

/** A super admin: we only ever set one role per user (identity.permissions.ts). */
const superAdminRole = eq(user.role, 'superadmin')

// --- Guards ---

/** Across shops: aborts the batch when a super admin already exists (the seed refuses, spec §14). */
export function requireNoPlatformAdmin(db: Db): Statement {
  return requireCount(db, sql`${db.$count(user, superAdminRole)}`, 0)
}

// --- Write statements ---

/** Ends every session of the user, or every one but `exceptToken`. */
export function deleteSessionsStatement(db: Db, userId: string, exceptToken?: string): Statement {
  return db.delete(session).where(and(eq(session.userId, userId), exceptToken ? ne(session.token, exceptToken) : undefined))
}

interface PasswordReset {
  userId: string
  passwordHash: string
  now: Date
}

/** Sets a new (temporary) password and marks it to be changed at the next sign-in. */
export function resetPasswordStatements(db: Db, reset: PasswordReset): Statement[] {
  const { userId, passwordHash, now } = reset
  return [
    db.update(account).set({ password: passwordHash, updatedAt: now }).where(and(eq(account.userId, userId), eq(account.providerId, 'credential'))),
    db.update(user).set({ mustChangePassword: true, updatedAt: now }).where(eq(user.id, userId)),
  ]
}

export interface NewPlatformAdmin {
  userId: string
  accountId: string
  username: string
  name: string
  email: string
  passwordHash: string
  now: Date
}

/** The super admin's user and its password account (Better Auth's `credential` provider). */
export function insertPlatformAdminStatements(db: Db, admin: NewPlatformAdmin): Statement[] {
  const { userId, accountId, username, name, email, passwordHash, now } = admin
  return [
    db.insert(user).values({ id: userId, name, email, emailVerified: true, username, displayUsername: username, role: 'superadmin', mustChangePassword: true, createdAt: now, updatedAt: now }),
    db.insert(account).values({ id: accountId, accountId: userId, providerId: 'credential', userId, password: passwordHash, createdAt: now, updatedAt: now }),
  ]
}

export interface NewShop {
  shopId: string
  name: string
  slug: string
  now: Date
}

/** The shop's organization (spec T2: a shop is a Better Auth organization). */
export function insertOrganizationStatement(db: Db, shop: NewShop): Statement {
  const { shopId, name, slug, now } = shop
  return db.insert(organization).values({ id: shopId, name, slug, createdAt: now })
}

/** Renames the shop's organization. */
export function renameOrganizationStatement(db: Db, shopId: string, name: string): Statement {
  return db.update(organization).set({ name }).where(eq(organization.id, shopId))
}

export interface NewOwner {
  shopId: string
  userId: string
  accountId: string
  memberId: string
  username: string
  name: string
  email: string
  passwordHash: string
  now: Date
}

/**
 * A shop owner: the user (platform role `user`, on a temporary password), its password account and
 * its membership. `member_user_id_unique` keeps it to one shop.
 */
export function insertOwnerStatements(db: Db, owner: NewOwner): Statement[] {
  const { shopId, userId, accountId, memberId, username, name, email, passwordHash, now } = owner
  return [
    db.insert(user).values({ id: userId, name, email, emailVerified: true, username, displayUsername: username, role: 'user', mustChangePassword: true, createdAt: now, updatedAt: now }),
    db.insert(account).values({ id: accountId, accountId: userId, providerId: 'credential', userId, password: passwordHash, createdAt: now, updatedAt: now }),
    db.insert(member).values({ id: memberId, organizationId: shopId, userId, role: 'owner', createdAt: now }),
  ]
}
