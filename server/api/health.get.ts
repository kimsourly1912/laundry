import { databaseAnswers } from '#server/utils/health'

/**
 * `GET /api/health`: 200 `{ status: 'ok' }` when the Worker can reach its database, 503
 * `{ status: 'unavailable' }` when not; no details either way (docs/server/operations.md →
 * Monitoring). The deploy's smoke check calls it. Public and not rate-limited on purpose.
 */
export default defineEventHandler(async (event) => {
  if (await databaseAnswers(useDb())) return { status: 'ok' }
  log('error', 'Health check: database unavailable', {}, event)
  setResponseStatus(event, 503)
  return { status: 'unavailable' }
})
