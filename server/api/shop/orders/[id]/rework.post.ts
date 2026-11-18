import { orderActionSchema } from '#shared/contracts/orders'
import { reworkOrder } from '#server/features/orders'

/** `POST /api/shop/orders/:id/rework`: Ready → In progress (rework), at the version read. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { order: ['work'] })
  const orderId = readIdParam(event, 'id', 'This order')
  const input = await readValidBody(event, orderActionSchema)
  return reworkOrder(useDb(), actor, { orderId, input })
})
