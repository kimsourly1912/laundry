import { enforceRateLimit, rateLimitRule } from '#server/utils/rate-limit'

/** Per-address limits on the public API and the webhook: see server/utils/rate-limit.ts. */
export default defineEventHandler(async (event) => {
  if (!rateLimitRule(event.path)) return
  await enforceRateLimit(event)
})
