import { shopTemplates } from '#server/features/templates'

/** The templates attached to a shop, for its page (step 2). */
export default defineEventHandler(async (event) => {
  await requirePlatformPermission(event, { shop: ['read'], template: ['read'] })
  const shopId = readIdParam(event, 'shopId', 'The shop')
  return shopTemplates(useDb(), shopId)
})
