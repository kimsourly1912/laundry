import { requestListQuerySchema } from '#shared/contracts/template-requests'
import { requestQueue } from '#server/features/templates'

/** `GET /api/platform/template-requests?status=`: the queue, oldest first, with each shop's name. */
export default defineEventHandler(async (event) => {
  await requirePlatformPermission(event, { template: ['read'] })
  const query = readValidQuery(event, requestListQuerySchema)
  return requestQueue(useDb(), query)
})
