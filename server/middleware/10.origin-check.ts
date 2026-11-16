import { isTrustedOrigin } from '#server/utils/request-protection'

/** CSRF protection for cookie-authenticated writes to our API (server/utils/request-protection.ts). */
export default defineEventHandler((event) => {
  const trusted = isTrustedOrigin({
    method: event.method,
    path: event.path,
    origin: getHeader(event, 'origin'),
    referer: getHeader(event, 'referer'),
    requestOrigin: getRequestURL(event).origin,
    siteUrl: useRuntimeConfig(event).public.siteUrl || undefined,
  })
  if (!trusted) throw apiError(403, ErrorCodes.FORBIDDEN, 'This request must come from the Laundry site.')
})
