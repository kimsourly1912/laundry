import { newId } from '#server/utils/ids'
import { requestIdFrom } from '#server/utils/request-protection'

/**
 * Gives every request an id (Cloudflare's `cf-ray` when present, else a new one), as
 * `event.context.requestId`, sent back as `X-Request-Id`, and included in error bodies and logs so a
 * screenshot of an error leads to the log line. Runs first (file name order).
 */
export default defineEventHandler((event) => {
  const requestId = requestIdFrom(getHeader(event, 'cf-ray'), newId)
  event.context.requestId = requestId
  setHeader(event, 'X-Request-Id', requestId)
})
