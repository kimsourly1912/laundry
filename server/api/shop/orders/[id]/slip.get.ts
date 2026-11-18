import { orderSlipQuerySchema } from '#shared/contracts/orders'
import { orderSlipSvg } from '#server/features/orders'

/** `GET /api/shop/orders/:id/slip?qr=` (D39): the saved slip as SVG, on its own version; 404 for another shop's. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { order: ['read'] })
  const orderId = readIdParam(event, 'id', 'This order')
  const { qr } = readValidQuery(event, orderSlipQuerySchema)
  return svgResponse(await orderSlipSvg(useDb(), actor, { orderId, qrUrl: qr }))
})
