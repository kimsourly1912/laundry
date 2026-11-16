import type { BetterAuthPlugin } from 'better-auth'

/**
 * The Better Auth endpoints a browser may call (`/api/auth/<path>`): the ones the app uses, nothing
 * else. Better Auth mounts every plugin's endpoints (organization members, invitations, roles; the
 * admin plugin's users; account updates…). Those would change memberships and accounts without our
 * routes' rules, audit rows and version guards, so they're closed (spec §5). An allowlist, not a
 * blocklist: an endpoint a Better Auth upgrade adds stays closed until a page needs it.
 *
 * Only HTTP requests are checked; the server's own `auth.api.*` calls go through. A path spelled any
 * other way (case, `//`, encoded slashes) is not on the list and is refused like any other.
 */
export const AUTH_HTTP_ENDPOINTS: readonly RegExp[] = [
  // Session and sign-in (spec P4: username + password; no sign-up, no email sign-in).
  /^\/get-session$/,
  /^\/sign-in\/username$/,
  /^\/sign-out$/,
  // Account (spec §3): change password, see and end this account's other sessions.
  /^\/change-password$/,
  /^\/list-sessions$/,
  /^\/revoke-other-sessions$/,
]

/** The path after Better Auth's base path (`/api/auth`), one trailing slash dropped; `null` outside it. */
export function authEndpointPath(url: string, baseURL: string): string | null {
  const basePath = new URL(baseURL).pathname.replace(/\/+$/, '')
  const pathname = new URL(url).pathname
  if (!pathname.startsWith(`${basePath}/`)) return null
  const path = pathname.slice(basePath.length)
  return path.length > 1 ? path.replace(/\/$/, '') : path
}

export function isAllowedAuthEndpoint(path: string): boolean {
  return AUTH_HTTP_ENDPOINTS.some(endpoint => endpoint.test(path))
}

/** Answers `403 FORBIDDEN` to any other Better Auth endpoint requested over HTTP (spec §5). */
export function authEndpointAllowlist() {
  return {
    id: 'auth-endpoint-allowlist',
    onRequest: async (request, ctx) => {
      const path = authEndpointPath(request.url, ctx.baseURL)
      if (path !== null && isAllowedAuthEndpoint(path)) return
      const body = JSON.stringify({ code: 'FORBIDDEN', message: 'You don\'t have permission to do this.' })
      return { response: new Response(body, { status: 403, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }) }
    },
  } satisfies BetterAuthPlugin
}
