import { shopRequests } from '#server/features/templates'

/** `GET /api/shop/template-requests`: the shop's own requests, newest first. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { template: ['request'] })
  return shopRequests(useDb(), actor)
})
