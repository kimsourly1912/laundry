import { getTemplate } from '#server/features/templates'

export default defineEventHandler(async (event) => {
  await requirePlatformPermission(event, { template: ['read'] })
  const id = readIdParam(event, 'templateId', 'The template')
  return getTemplate(useDb(), id)
})
