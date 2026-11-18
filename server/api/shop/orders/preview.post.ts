import { orderPreviewSchema } from '#shared/contracts/orders'
import { previewOrderSvg } from '#server/features/orders'

/** `POST /api/shop/orders/preview` (D39): an HTML slip's draft as SVG, drawn by the server; nothing is saved. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { order: ['create'] })
  const input = await readValidBody(event, orderPreviewSchema)
  return svgResponse(await previewOrderSvg(useDb(), actor, input))
})
