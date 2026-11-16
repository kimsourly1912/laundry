import { toErrorResponse } from '#server/utils/errors'
import { log } from '#server/utils/log'

/**
 * Error responses for `/api/**` (docs/server/architecture.md → Errors): the flat body
 * `{ code, message, fieldErrors?, requestId }` (spec §9, D9). Registered before Nuxt's own handler
 * in `nuxt.config.ts` (`nitro:config` hook); anything else falls through to Nuxt, which renders the
 * error pages. 5xx never carry details: the cause is logged with the request id.
 */
export default defineNitroErrorHandler(async (error, event) => {
  if (!event.path.startsWith('/api/')) return

  const requestId = event.context.requestId as string | undefined
  const { status, body, isServerError } = toErrorResponse(error, requestId)
  if (isServerError) {
    log('error', 'Unhandled error', { status, error: error.message, cause: String(error.cause ?? ''), stack: error.stack }, event)
  }

  setResponseStatus(event, status)
  setResponseHeader(event, 'Content-Type', 'application/json')
  setResponseHeader(event, 'Cache-Control', 'no-store')
  await send(event, JSON.stringify(body))
})
