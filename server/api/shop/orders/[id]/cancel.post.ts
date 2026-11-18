import { orderActionSchema } from '#shared/contracts/orders'
import { cancelOrder } from '#server/features/orders'

/** `POST /api/shop/orders/:id/cancel`: cancels an open order, at the version read. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { order: ['cancel'] })
  const orderId = readIdParam(event, 'id', 'This order')
  const input = await readValidBody(event, orderActionSchema)
  return cancelOrder(useDb(), actor, { orderId, input })
})
