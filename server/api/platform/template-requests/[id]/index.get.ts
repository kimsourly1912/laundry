import { getRequest } from '#server/features/templates'

/** `GET /api/platform/template-requests/:id`. */
export default defineEventHandler(async (event) => {
  await requirePlatformPermission(event, { template: ['read'] })
  const requestId = readIdParam(event, 'id', 'This request')
  return getRequest(useDb(), requestId)
})
