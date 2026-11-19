import { listPrices } from '#server/features/prices'

/** `GET /api/shop/prices`: one row per priced item on the shop's slips, and the prices kept for old orders (D43). */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { price: ['read'] })
  return listPrices(useDb(), actor)
})
