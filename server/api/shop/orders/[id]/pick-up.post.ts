import { orderActionSchema } from '#shared/contracts/orders'
import { pickUpOrder } from '#server/features/orders'

/** `POST /api/shop/orders/:id/pick-up`: the customer took the bag, at the version read. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { order: ['pick-up'] })
  const orderId = readIdParam(event, 'id', 'This order')
  const input = await readValidBody(event, orderActionSchema)
  return pickUpOrder(useDb(), actor, { orderId, input })
})
