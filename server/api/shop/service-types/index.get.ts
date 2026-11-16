import { priceListQuerySchema } from '#shared/contracts/pricing'
import { listServiceTypes } from '#server/features/pricing'

export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { price: ['read'] })
  const query = readValidQuery(event, priceListQuerySchema)
  return listServiceTypes(useDb(), actor, query)
})
