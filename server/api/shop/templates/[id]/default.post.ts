import { setDefaultTemplate } from '#server/features/templates'

/** `POST /api/shop/templates/:id/default`: makes an attached template the shop's default; answers the shop's templates. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { template: ['set-default'] })
  const templateId = readIdParam(event, 'id', 'This paper slip')
  return setDefaultTemplate(useDb(), actor, templateId)
})
