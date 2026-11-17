import { detachTemplate } from '#server/features/templates'

/** Detaches the template from the shop: nothing is lost (orders keep their version). */
export default defineEventHandler(async (event) => {
  const actor = await requirePlatformPermission(event, { template: ['write'], shop: ['update'] })
  const templateId = readIdParam(event, 'id', 'The template')
  const shopId = readIdParam(event, 'shopId', 'The shop')
  return detachTemplate(useDb(), actor, templateId, shopId)
})
