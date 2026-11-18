import { orderTemplateImage } from '#server/features/templates'

/** `GET /api/shop/templates/:id/images/:imageId`: the artwork of an attached template's latest version. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { template: ['read'] })
  const templateId = readIdParam(event, 'id', 'This paper slip')
  const imageId = readIdParam(event, 'imageId', 'The image')
  const { bytes, type } = await orderTemplateImage(useDb(), actor, { templateId, imageId })
  return imageResponse(bytes, type)
})
