import { orderActionSchema } from '#shared/contracts/orders'
import { markPaid } from '#server/features/orders'

/** `POST /api/shop/orders/:id/payment` with an `Idempotency-Key`: marks the order paid, at the version read. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { order: ['pay'] })
  const orderId = readIdParam(event, 'id', 'This order')
  const key = readIdempotencyKey(event)
  const input = await readValidBody(event, orderActionSchema)
  const { order } = await markPaid(useDb(), actor, { orderId, input, key })
  return order
})
