/**
 * Session lifetimes by role (spec T16, §12). Pure: the Better Auth hooks in identity.auth.ts apply
 * them, and the tests check them without a server.
 *
 * - **Shop owner:** Better Auth's own sliding session: 30 days idle, renewed at most once a day
 *   while used, no absolute cap. An owner who opens the app once a month never signs in again.
 * - **Super admin:** 12 hours idle, 7 days from sign-in at most. Better Auth's lifetime is global,
 *   so the hooks clamp a super admin's `expiresAt` whenever the session is created or renewed;
 *   Better Auth itself then refuses the expired session (D14).
 */

const HOUR_MS = 60 * 60 * 1000
const DAY_S = 24 * 60 * 60

/** Better Auth `session.expiresIn` (seconds): the shop owner's idle lifetime. */
export const SESSION_EXPIRES_IN_S = 30 * DAY_S
/** Better Auth `session.updateAge` (seconds): renew an owner's session at most once a day. */
export const SESSION_UPDATE_AGE_S = DAY_S

export const ADMIN_IDLE_MS = 12 * HOUR_MS
export const ADMIN_MAX_AGE_MS = 7 * 24 * HOUR_MS

/** Whether a user's (comma-separated) Better Auth role includes the super admin. */
export function isSuperAdmin(role: unknown): boolean {
  return typeof role === 'string' && role.split(',').some(part => part.trim() === 'superadmin')
}

interface AdminExpiry {
  /** When the session was created (sign-in). */
  createdAt: Date
  now: Date
}

/** A super admin's session expiry: 12 h from now, never past 7 days from sign-in. */
export function adminSessionExpiry(expiry: AdminExpiry): Date {
  const { createdAt, now } = expiry
  return new Date(Math.min(now.getTime() + ADMIN_IDLE_MS, createdAt.getTime() + ADMIN_MAX_AGE_MS))
}
