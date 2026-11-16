import { orderActionSchema } from '#shared/contracts/orders'
import { recordPayment } from '#server/features/orders'

/** Records the full payment at most once per `Idempotency-Key`: 201, or 200 for a repeat. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { payment: ['record'] })
  const id = readIdParam(event, 'id', 'The order')
  const key = readIdempotencyKey(event)
  const input = await readValidBody(event, orderActionSchema)
  const { order, replayed } = await recordPayment(useDb(), actor, id, input, key)
  setResponseStatus(event, replayed ? 200 : 201)
  return order
})
