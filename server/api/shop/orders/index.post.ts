import { createOrderSchema } from '#shared/contracts/orders'
import { createOrder } from '#server/features/orders'

/** Creates an order (spec §8.1) at most once per `Idempotency-Key`: 201, or 200 for a repeat. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { order: ['create'] })
  const key = readIdempotencyKey(event)
  const input = await readValidBody(event, createOrderSchema)
  const { order, replayed } = await createOrder(useDb(), actor, input, key)
  setResponseStatus(event, replayed ? 200 : 201)
  return order
})
