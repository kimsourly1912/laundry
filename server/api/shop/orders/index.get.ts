import { orderListQuerySchema } from '#shared/contracts/orders'
import { listOrders } from '#server/features/orders'

export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { order: ['read'] })
  const query = readValidQuery(event, orderListQuerySchema)
  return listOrders(useDb(), actor, query)
})
