import { templateStatusChangeSchema } from '#shared/contracts/templates'
import { archiveTemplate } from '#server/features/templates'

export default defineEventHandler(async (event) => {
  const actor = await requirePlatformPermission(event, { template: ['write'] })
  const id = readIdParam(event, 'templateId', 'The template')
  const input = await readValidBody(event, templateStatusChangeSchema)
  return archiveTemplate(useDb(), actor, id, input)
})
