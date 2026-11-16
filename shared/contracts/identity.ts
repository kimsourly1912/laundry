import * as v from 'valibot'

/**
 * Account rules the server and the app share (spec §12 → Passwords). The server applies them again
 * in Better Auth's configuration (identity.auth.ts) and wherever it sets a password itself.
 */

export const MIN_PASSWORD_LENGTH = 10
export const MAX_PASSWORD_LENGTH = 128
export const MIN_USERNAME_LENGTH = 3
export const MAX_USERNAME_LENGTH = 32

/**
 * A username: trimmed and lowercase (one spelling per account, D15), letters, digits, `_` and `.`,
 * the characters Better Auth's username plugin accepts.
 */
export const usernameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.minLength(MIN_USERNAME_LENGTH, `At least ${MIN_USERNAME_LENGTH} characters`),
  v.maxLength(MAX_USERNAME_LENGTH, `At most ${MAX_USERNAME_LENGTH} characters`),
  v.regex(/^[a-z0-9_.]+$/, 'Use letters, numbers, _ and . only'),
)

/** A password as typed: never trimmed (spaces are characters). */
export const passwordSchema = v.pipe(
  v.string(),
  v.minLength(MIN_PASSWORD_LENGTH, `At least ${MIN_PASSWORD_LENGTH} characters`),
  v.maxLength(MAX_PASSWORD_LENGTH, `At most ${MAX_PASSWORD_LENGTH} characters`),
)

/** `GET /api/me`: who is signed in, their shop (if any) and what they may do. */
export interface MeResponse {
  user: { id: string, name: string, username: string | null }
  mustChangePassword: boolean
  /** `superadmin` for the platform team, else `null`. */
  platformRole: 'superadmin' | null
  shop: { id: string, name: string, status: 'active' | 'suspended' } | null
  /** Granted `resource:action` statements: the shop's (none while suspended), or the platform's. */
  statements: string[]
}
