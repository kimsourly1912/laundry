import { orderReceipt } from '#server/features/receipts'

/** The order's receipt as the customer gets it on Telegram (D28). 404 until the shop has a design. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { order: ['read'] })
  const id = readIdParam(event, 'id', 'The order')
  return imageResponse(await orderReceipt(useDb(), actor, id), 'image/png')
})
