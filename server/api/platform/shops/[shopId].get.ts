import { getShop } from '#server/features/shops'

export default defineEventHandler(async (event) => {
  await requirePlatformPermission(event, { shop: ['read'] })
  const shopId = readIdParam(event, 'shopId', 'The shop')
  return getShop(useDb(), shopId)
})
