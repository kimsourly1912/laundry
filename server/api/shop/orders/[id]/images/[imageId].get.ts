import { orderImage } from '#server/features/orders'

/** `GET /api/shop/orders/:id/images/:imageId`: the artwork of the version the order was made on. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { order: ['read'] })
  const orderId = readIdParam(event, 'id', 'This order')
  const imageId = readIdParam(event, 'imageId', 'The image')
  const { bytes, type } = await orderImage(useDb(), actor, { orderId, imageId })
  return imageResponse(bytes, type)
})
