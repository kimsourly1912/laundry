import { getOrder } from '#server/features/orders'

export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { order: ['read'] })
  const id = readIdParam(event, 'id', 'The order')
  return getOrder(useDb(), actor, id)
})
