/**
 * Request checks the middleware runs on every request (docs/server/security.md → Request
 * protection), as pure functions so they can be tested without a server.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
/** Better Auth checks its own routes' origin; webhooks authenticate with their secret. */
const ORIGIN_EXEMPT = ['/api/auth/', '/api/webhooks/']

function originOf(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).origin
  }
  catch {
    return undefined
  }
}

export interface OriginCheck {
  method: string
  path: string
  /** The `Origin` header. */
  origin: string | undefined
  /** The `Referer` header, used when there is no `Origin`. */
  referer: string | undefined
  /** The origin the request was sent to. */
  requestOrigin: string
  /** `NUXT_PUBLIC_SITE_URL`, when set. */
  siteUrl: string | undefined
}

/**
 * Whether a request passes the CSRF check: a non-GET request to `/api/**` must come from this site,
 * its `Origin` (or `Referer`) being the request's own origin or the site URL. SameSite=Lax cookies
 * alone would still accept a write from a sibling subdomain of `angder.app`.
 */
export function isTrustedOrigin(check: OriginCheck): boolean {
  const { method, path, origin, referer, requestOrigin, siteUrl } = check
  if (SAFE_METHODS.has(method) || !path.startsWith('/api/') || ORIGIN_EXEMPT.some(prefix => path.startsWith(prefix))) return true
  const sender = origin ?? originOf(referer)
  if (!sender) return false
  return sender === requestOrigin || sender === originOf(siteUrl)
}

/**
 * A request's id: Cloudflare's `cf-ray` when present (the same id as Cloudflare's own logs), else
 * the one given. Only a short token of safe characters is accepted from the header.
 */
export function requestIdFrom(cfRay: string | undefined, fallback: () => string): string {
  return cfRay && /^[\w-]{1,64}$/.test(cfRay) ? cfRay : fallback()
}
