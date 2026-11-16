import { orderActionSchema } from '#shared/contracts/orders'
import { transitionOrder } from '#server/features/orders'

export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { order: ['transition'] })
  const id = readIdParam(event, 'id', 'The order')
  const input = await readValidBody(event, orderActionSchema)
  return transitionOrder(useDb(), actor, id, { action: 'ready', input })
})
