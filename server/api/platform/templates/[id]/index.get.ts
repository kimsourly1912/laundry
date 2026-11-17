import { getTemplate } from '#server/features/templates'

export default defineEventHandler(async (event) => {
  await requirePlatformPermission(event, { template: ['read'] })
  const templateId = readIdParam(event, 'id', 'The template')
  return getTemplate(useDb(), templateId)
})
