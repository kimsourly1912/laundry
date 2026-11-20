import { orderPreviewSchema } from '#shared/contracts/orders'
import { previewOrderDraft } from '#server/features/orders'

/** `POST /api/shop/orders/preview` (D39): an HTML slip's draft SVG and editable field boxes; nothing is saved. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { order: ['create'] })
  const input = await readValidBody(event, orderPreviewSchema)
  return previewOrderDraft(useDb(), actor, input)
})
