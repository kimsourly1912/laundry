import { listPrices } from '#server/features/prices'

/** `GET /api/shop/prices`: the shop's price list, archived items too. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { price: ['read'] })
  return listPrices(useDb(), actor)
})
