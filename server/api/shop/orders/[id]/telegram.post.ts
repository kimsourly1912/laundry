import { createOrderInvite } from '#server/features/telegram'

/**
 * `POST /api/shop/orders/:id/telegram`: a new QR for the order (a token valid a day; only its hash
 * is kept) and what its chats were sent. 409 `TELEGRAM_NOT_SET_UP` when this deployment has no bot.
 */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { order: ['share'] })
  const orderId = readIdParam(event, 'id', 'This order')
  const { botUsername } = useRuntimeConfig(event).telegram
  return createOrderInvite(useDb(), actor, { orderId, botUsername })
})
