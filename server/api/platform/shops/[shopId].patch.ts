import { updateShopSchema } from '#shared/contracts/platform-shops'
import { updateShop } from '#server/features/shops'

export default defineEventHandler(async (event) => {
  const actor = await requirePlatformPermission(event, { shop: ['update'] })
  const shopId = readIdParam(event, 'shopId', 'The shop')
  const input = await readValidBody(event, updateShopSchema)
  return updateShop(useDb(), actor, shopId, input)
})
