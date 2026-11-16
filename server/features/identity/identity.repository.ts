import { and, eq, ne, sql } from 'drizzle-orm'
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
