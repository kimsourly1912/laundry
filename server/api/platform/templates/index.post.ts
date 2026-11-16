import { createTemplateSchema } from '#shared/contracts/templates'
import { createTemplate } from '#server/features/templates'

/** `POST /api/platform/templates`: 201 with the template. */
export default defineEventHandler(async (event) => {
  const actor = await requirePlatformPermission(event, { template: ['write'] })
  const input = await readValidBody(event, createTemplateSchema)
  const template = await createTemplate(useDb(), actor, input)
  setResponseStatus(event, 201)
  return template
})
