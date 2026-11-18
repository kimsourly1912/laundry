import { orderTemplates } from '#server/features/templates'

/** `GET /api/shop/templates`: the published templates attached to the shop, each at its latest version (New order). */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { template: ['read'] })
  return orderTemplates(useDb(), actor)
})
