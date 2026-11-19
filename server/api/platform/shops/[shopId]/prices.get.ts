import { priceStatus } from '#server/features/prices'

/** `GET /api/platform/shops/:shopId/prices`: how many of the shop's slip prices are set (D43), never the amounts. */
export default defineEventHandler(async (event) => {
  await requirePlatformPermission(event, { shop: ['read'] })
  const shopId = readIdParam(event, 'shopId', 'The shop')
  return priceStatus(useDb(), shopId)
})
