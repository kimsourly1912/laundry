import { getSettings } from '#server/features/shops'

/** `GET /api/shop/settings`: the shop's settings (the shop from the session). */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { shop: ['read'] })
  return getSettings(useDb(), actor)
})
