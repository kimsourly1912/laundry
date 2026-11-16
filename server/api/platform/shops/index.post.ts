import { createShopSchema } from '#shared/contracts/platform-shops'
import { createShop } from '#server/features/shops'

/** `POST /api/platform/shops`: the shop and its owner in one batch; 201 with the shop. */
export default defineEventHandler(async (event) => {
  const actor = await requirePlatformPermission(event, { shop: ['create'], owner: ['create'] })
  const input = await readValidBody(event, createShopSchema)
  const shop = await createShop(useDb(), actor, input)
  setResponseStatus(event, 201)
  return shop
})
