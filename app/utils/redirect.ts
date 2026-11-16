/**
 * A `?redirect=` value safe to navigate to after sign-in: a path on this site only. Anything else
 * (`https://evil.example`, `//evil.example`, `/\\evil.example`) is dropped, so a crafted link can't
 * send someone elsewhere after they sign in.
 */
export function safeRedirect(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return undefined
  return value
}
