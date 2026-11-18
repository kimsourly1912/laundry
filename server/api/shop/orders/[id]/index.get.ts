import { getOrder } from '#server/features/orders'

/** `GET /api/shop/orders/:id`: one order with the template version it was made on (its slip, for a reprint). */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { order: ['read'] })
  const orderId = readIdParam(event, 'id', 'This order')
  return getOrder(useDb(), actor, orderId)
})
