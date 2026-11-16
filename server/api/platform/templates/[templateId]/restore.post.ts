import { templateStatusChangeSchema } from '#shared/contracts/templates'
import { restoreTemplate } from '#server/features/templates'

export default defineEventHandler(async (event) => {
  const actor = await requirePlatformPermission(event, { template: ['write'] })
  const id = readIdParam(event, 'templateId', 'The template')
  const input = await readValidBody(event, templateStatusChangeSchema)
  return restoreTemplate(useDb(), actor, id, input)
})
