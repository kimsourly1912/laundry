import { templateSampleSvg } from '#server/features/templates'

/** `GET /api/shop/templates/:id/sample` (D39): an attached template drawn by the server with sample values and the shop's details (Paper slips). */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { template: ['read'] })
  const templateId = readIdParam(event, 'id', 'This paper slip')
  return svgResponse(await templateSampleSvg(useDb(), actor, templateId))
})
