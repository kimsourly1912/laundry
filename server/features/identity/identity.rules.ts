/** Account rules (spec §12 → Passwords), pure. */

export const MIN_PASSWORD_LENGTH = 10
export const MAX_PASSWORD_LENGTH = 128

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
