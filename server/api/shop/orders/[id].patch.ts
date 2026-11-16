import { updateOrderSchema } from '#shared/contracts/orders'
import { updateOrder } from '#server/features/orders'

/** Lines and note, while received or in progress. The server recomputes the total. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { order: ['update'] })
  const id = readIdParam(event, 'id', 'The order')
  const input = await readValidBody(event, updateOrderSchema)
  return updateOrder(useDb(), actor, id, input)
})
