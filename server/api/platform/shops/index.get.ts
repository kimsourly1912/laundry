import { shopListQuerySchema } from '#shared/contracts/platform-shops'
import { listShops } from '#server/features/shops'

/** `GET /api/platform/shops?status=&search=&page=&pageSize=`: every shop, newest first. */
export default defineEventHandler(async (event) => {
  await requirePlatformPermission(event, { shop: ['read'] })
  const query = readValidQuery(event, shopListQuerySchema)
  return listShops(useDb(), query)
})
