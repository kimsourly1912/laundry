import { orderActionSchema } from '#shared/contracts/orders'
import { startOrder } from '#server/features/orders'

/** `POST /api/shop/orders/:id/start`: Received → In progress, at the version read. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { order: ['work'] })
  const orderId = readIdParam(event, 'id', 'This order')
  const input = await readValidBody(event, orderActionSchema)
  return startOrder(useDb(), actor, { orderId, input })
})
