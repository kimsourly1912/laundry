import { orderActionSchema } from '#shared/contracts/orders'
import { transitionOrder } from '#server/features/orders'

/** Owner only; audited. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { order: ['cancel'] })
  const id = readIdParam(event, 'id', 'The order')
  const input = await readValidBody(event, orderActionSchema)
  return transitionOrder(useDb(), actor, id, { action: 'cancel', input })
})
