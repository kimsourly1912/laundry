import { orderActionSchema } from '#shared/contracts/orders'
import { markReady } from '#server/features/orders'

/** `POST /api/shop/orders/:id/ready`: → Ready; queues "ready for pickup" to the linked chats, at the version read. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { order: ['work'] })
  const orderId = readIdParam(event, 'id', 'This order')
  const input = await readValidBody(event, orderActionSchema)
  return markReady(useDb(), actor, { orderId, input })
})
