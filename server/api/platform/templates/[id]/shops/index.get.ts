import { templateShops } from '#server/features/templates'

export default defineEventHandler(async (event) => {
  await requirePlatformPermission(event, { template: ['read'], shop: ['read'] })
  const templateId = readIdParam(event, 'id', 'The template')
  return templateShops(useDb(), templateId)
})
