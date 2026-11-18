import { requestPhoto } from '#server/features/templates'

/** `GET /api/shop/template-requests/:id/photo`: the shop's own photo; another shop's is 404. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { template: ['request'] })
  const requestId = readIdParam(event, 'id', 'This request')
  const { bytes, type } = await requestPhoto(useDb(), requestId, actor.shopId)
  return imageResponse(bytes, type)
})
