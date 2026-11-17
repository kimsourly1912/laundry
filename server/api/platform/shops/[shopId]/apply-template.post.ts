import { applyTemplateSchema } from '#shared/contracts/platform-shops'
import { applyTemplate } from '#server/features/shops'

/** Copies a template's price list into a shop whose price list is empty (D30). */
export default defineEventHandler(async (event) => {
  const actor = await requirePlatformPermission(event, { price: ['write'], template: ['read'] })
  const shopId = readIdParam(event, 'shopId', 'The shop')
  const input = await readValidBody(event, applyTemplateSchema)
  return applyTemplate(useDb(), actor, shopId, input)
})
