import { orderOverview } from '#server/features/orders'

/** `GET /api/shop/orders/overview`: Overview's counts for the shop's day. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { order: ['read'] })
  return orderOverview(useDb(), actor)
})
