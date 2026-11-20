import { orderSlipSvg } from '#server/features/orders'

/** `GET /api/shop/orders/:id/slip` (D47): the saved slip as SVG, on its own version; 404 for another shop's. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { order: ['read'] })
  const orderId = readIdParam(event, 'id', 'This slip')
  return svgResponse(await orderSlipSvg(useDb(), actor, { orderId }))
})
