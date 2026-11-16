/** Account rules (spec §12 → Passwords), pure. The limits are shared with the app. */

export { MAX_PASSWORD_LENGTH, MAX_USERNAME_LENGTH, MIN_PASSWORD_LENGTH, MIN_USERNAME_LENGTH } from '#shared/contracts/identity'

/** One spelling per username: trimmed and lowercase, so `Sokha` and `sokha ` are the same account. */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

/**
 * The email Better Auth requires on every user (spec §17): owners sign in with a username and
 * have no email. A placeholder under the reserved `.invalid` domain (RFC 2606), unique per user,
 * never shown and never mailed: nothing sends email.
 */
export function placeholderEmail(userId: string): string {
  return `${userId}@users.invalid`
}
