import { priceListQuerySchema } from '#shared/contracts/pricing'
import { listPriceItems } from '#server/features/pricing'
import { platformShopActor } from '#server/features/shops'

/** A shop's price items, for the platform that keeps its price list (D26). */
export default defineEventHandler(async (event) => {
  const actor = await requirePlatformPermission(event, { price: ['read'] })
  const shopId = readIdParam(event, 'shopId', 'The shop')
  const query = readValidQuery(event, priceListQuerySchema)
  const db = useDb()
  return listPriceItems(db, await platformShopActor(db, actor, shopId), query)
})
