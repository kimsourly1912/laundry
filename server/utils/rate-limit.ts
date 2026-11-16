import type { H3Event } from 'h3'
import { getHeader, setResponseHeader } from 'h3'
import { apiError, ErrorCodes } from './errors'
import { log } from './log'

/**
 * Per-address limits with Cloudflare's Workers rate-limit bindings (docs/server/security.md →
 * Request protection). The first rule whose prefix matches applies. Each binding's numbers live in
 * the Worker's configuration (`RATE_LIMITS` in nuxt.config.ts). Sign-in is limited by Better Auth
 * itself (M1.4).
 *
 * Where no binding exists (the dev server, tests), nothing is limited. Cloudflare counts per
 * location and lets a few requests past a limit: this bounds abuse, it isn't a quota.
 *
 * `/api/health` stays outside on purpose: an outside monitor calls it, and a limit keyed on a
 * shared address would let anyone use up the monitor's count.
 */
export const RATE_LIMIT_RULES = [
  // The public ticket page's lookup: a token guess per request. Generous, as mobile carriers put
  // many customers behind one address.
  { prefix: '/api/public/', binding: 'RATE_LIMIT_PUBLIC' },
  // Telegram's servers call it from a few addresses.
  { prefix: '/api/webhooks/', binding: 'RATE_LIMIT_WEBHOOK' },
] as const satisfies readonly { prefix: string, binding: string }[]

export type RateLimitBinding = (typeof RATE_LIMIT_RULES)[number]['binding']

/** Cloudflare's binding (`env.X.limit({ key })`); a stand-in in tests. */
export interface RateLimiter {
  limit: (options: { key: string }) => Promise<{ success: boolean }>
}

/** The rule for a path (its query and trailing slashes ignored), or `undefined`. */
export function rateLimitRule(path: string) {
  const bare = path.split(/[?#]/, 1)[0]!.replace(/\/+$/, '/')
  return RATE_LIMIT_RULES.find(rule => bare.startsWith(rule.prefix))
}

export interface RateLimitRequest {
  path: string
  /** `cf-connecting-ip`: set by Cloudflare; a client can't forge it. */
  address: string | undefined
  limiters: Partial<Record<RateLimitBinding, RateLimiter>>
}

/** `limited` names the binding that refused; `checked` is false when no rule, binding or address applied. */
export async function checkRateLimit(request: RateLimitRequest): Promise<{ checked: boolean, limited: RateLimitBinding | null }> {
  const { path, address, limiters } = request
  const rule = rateLimitRule(path)
  const limiter = rule ? limiters[rule.binding] : undefined
  if (!rule || !limiter || !address) return { checked: false, limited: null }
  const { success } = await limiter.limit({ key: address })
  return { checked: true, limited: success ? null : rule.binding }
}

export function rateLimited() {
  return apiError(429, ErrorCodes.RATE_LIMITED, 'Too many requests. Wait a minute and try again.')
}

/** The middleware's work: refuses with 429 when over the limit. A broken limiter lets the request through. */
export async function enforceRateLimit(event: H3Event) {
  const env = (event.context.cloudflare as { env?: Partial<Record<RateLimitBinding, RateLimiter>> } | undefined)?.env
  if (!env) return
  let outcome: Awaited<ReturnType<typeof checkRateLimit>>
  try {
    outcome = await checkRateLimit({ path: event.path, address: getHeader(event, 'cf-connecting-ip'), limiters: env })
  }
  catch (error) {
    log('warn', 'Rate limiter unavailable; request allowed', { error: String(error) }, event)
    return
  }
  if (outcome.limited) {
    log('info', 'Rate limited', { binding: outcome.limited }, event)
    setResponseHeader(event, 'Retry-After', 60)
    throw rateLimited()
  }
}
