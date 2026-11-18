import { MAX_DESIGN_BYTES } from '#shared/contracts/slip-design'
import { previewHtmlTemplateSchema } from '#shared/contracts/templates'
import { previewHtmlTemplate } from '#server/features/templates'

export default defineEventHandler(async (event) => {
  await requirePlatformPermission(event, { template: ['read'] })
  const input = await readValidBody(event, previewHtmlTemplateSchema, { maxBytes: MAX_DESIGN_BYTES })
  return svgResponse(await previewHtmlTemplate(input))
})
