import { describe, expect, it } from 'vitest'
import { checkRateLimit, rateLimitRule } from '#server/utils/rate-limit'
import type { RateLimiter } from '#server/utils/rate-limit'

function limiter(allowed: boolean): RateLimiter & { keys: string[] } {
  const keys: string[] = []
  return {
    keys,
    limit: async ({ key }) => {
      keys.push(key)
      return { success: allowed }
    },
  }
}

describe('rateLimitRule', () => {
  it('covers the public ticket lookup and the webhook', () => {
    expect(rateLimitRule('/api/public/tickets/abc')?.binding).toBe('RATE_LIMIT_PUBLIC')
    expect(rateLimitRule('/api/public/tickets/abc?x=1')?.binding).toBe('RATE_LIMIT_PUBLIC')
    expect(rateLimitRule('/api/webhooks/telegram')?.binding).toBe('RATE_LIMIT_WEBHOOK')
  })

  it('leaves health, the shop API and pages alone', () => {
    for (const path of ['/api/health', '/api/shop/orders', '/t/abc', '/']) expect(rateLimitRule(path)).toBeUndefined()
  })
})

describe('checkRateLimit', () => {
  it('counts per client address and refuses over the limit', async () => {
    const refusing = limiter(false)
    expect(await checkRateLimit({ path: '/api/public/tickets/x', address: '203.0.113.9', limiters: { RATE_LIMIT_PUBLIC: refusing } }))
      .toEqual({ checked: true, limited: 'RATE_LIMIT_PUBLIC' })
    expect(refusing.keys).toEqual(['203.0.113.9'])
    expect(await checkRateLimit({ path: '/api/public/tickets/x', address: '203.0.113.9', limiters: { RATE_LIMIT_PUBLIC: limiter(true) } }))
      .toEqual({ checked: true, limited: null })
  })

  it('checks nothing without a rule, a binding (dev, tests) or an address', async () => {
    const unchecked = { checked: false, limited: null }
    expect(await checkRateLimit({ path: '/api/shop/orders', address: '1.1.1.1', limiters: { RATE_LIMIT_PUBLIC: limiter(false) } })).toEqual(unchecked)
    expect(await checkRateLimit({ path: '/api/public/tickets/x', address: '1.1.1.1', limiters: {} })).toEqual(unchecked)
    expect(await checkRateLimit({ path: '/api/public/tickets/x', address: undefined, limiters: { RATE_LIMIT_PUBLIC: limiter(false) } })).toEqual(unchecked)
  })
})
