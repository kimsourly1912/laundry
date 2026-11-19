import { MAX_HTML_PREVIEW_BYTES, previewHtmlTemplateSchema } from '#shared/contracts/templates'
import { previewHtmlTemplate } from '#server/features/templates'

export default defineEventHandler(async (event) => {
  await requirePlatformPermission(event, { template: ['read'] })
  const input = await readValidBody(event, previewHtmlTemplateSchema, { maxBytes: MAX_HTML_PREVIEW_BYTES })
  return svgResponse(await previewHtmlTemplate(useDb(), input))
})
