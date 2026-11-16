import { updateTemplateSchema } from '#shared/contracts/templates'
import { updateTemplate } from '#server/features/templates'

export default defineEventHandler(async (event) => {
  const actor = await requirePlatformPermission(event, { template: ['write'] })
  const id = readIdParam(event, 'templateId', 'The template')
  const input = await readValidBody(event, updateTemplateSchema)
  return updateTemplate(useDb(), actor, id, input)
})
