import { requestPhoto } from '#server/features/templates'

/** `GET /api/platform/template-requests/:id/photo`: the shop's reference photo. */
export default defineEventHandler(async (event) => {
  await requirePlatformPermission(event, { template: ['read'] })
  const requestId = readIdParam(event, 'id', 'This request')
  const { bytes, type } = await requestPhoto(useDb(), requestId)
  return imageResponse(bytes, type)
})
