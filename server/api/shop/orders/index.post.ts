import { createOrderSchema } from '#shared/contracts/orders'
import { createOrder } from '#server/features/orders'

/** `POST /api/shop/orders` with an `Idempotency-Key`: 201 with the new order, 200 with it again on a replay. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { order: ['create'] })
  const key = readIdempotencyKey(event)
  const input = await readValidBody(event, createOrderSchema)
  const { order, replayed } = await createOrder(useDb(), actor, { input, key })
  setResponseStatus(event, replayed ? 200 : 201)
  return order
})
