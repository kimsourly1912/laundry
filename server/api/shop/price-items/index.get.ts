import { priceListQuerySchema } from '#shared/contracts/pricing'
import { listPriceItems } from '#server/features/pricing'

export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { price: ['read'] })
  const query = readValidQuery(event, priceListQuerySchema)
  return listPriceItems(useDb(), actor, query)
})
