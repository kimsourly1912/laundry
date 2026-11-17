import { MAX_DESIGN_BYTES } from '#shared/contracts/slip-design'
import { previewTemplateSchema } from '#shared/contracts/templates'
import { previewTemplate } from '#server/features/templates'

/** The studio's Preview: the design on screen as the customer's PNG, with sample values. */
export default defineEventHandler(async (event) => {
  await requirePlatformPermission(event, { template: ['read'] })
  const templateId = readIdParam(event, 'id', 'The template')
  const input = await readValidBody(event, previewTemplateSchema, { maxBytes: MAX_DESIGN_BYTES })
  return imageResponse(await previewTemplate(useDb(), templateId, input), 'image/png')
})
