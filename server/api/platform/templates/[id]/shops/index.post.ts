import { attachTemplateSchema } from '#shared/contracts/templates'
import { attachTemplate } from '#server/features/templates'

export default defineEventHandler(async (event) => {
  const actor = await requirePlatformPermission(event, { template: ['write'], shop: ['update'] })
  const templateId = readIdParam(event, 'id', 'The template')
  const input = await readValidBody(event, attachTemplateSchema)
  return attachTemplate(useDb(), actor, templateId, input)
})
