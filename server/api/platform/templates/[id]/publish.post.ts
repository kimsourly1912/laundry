import { publishTemplateSchema } from '#shared/contracts/templates'
import { publishTemplate } from '#server/features/templates'

export default defineEventHandler(async (event) => {
  const actor = await requirePlatformPermission(event, { template: ['write'] })
  const templateId = readIdParam(event, 'id', 'The template')
  const input = await readValidBody(event, publishTemplateSchema)
  return publishTemplate(useDb(), actor, templateId, input)
})
