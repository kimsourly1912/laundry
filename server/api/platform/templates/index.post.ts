import { createTemplateSchema } from '#shared/contracts/templates'
import { createTemplate } from '#server/features/templates'

export default defineEventHandler(async (event) => {
  const actor = await requirePlatformPermission(event, { template: ['write'] })
  const input = await readValidBody(event, createTemplateSchema)
  setResponseStatus(event, 201)
  return createTemplate(useDb(), actor, input)
})
