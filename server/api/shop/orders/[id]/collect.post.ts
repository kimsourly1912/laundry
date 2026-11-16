import { collectOrderSchema } from '#shared/contracts/orders'
import { collectOrder } from '#server/features/orders'
import { deliverOrderSoon } from '#server/features/telegram'

/** Unpaid needs `allowUnpaid: true` (spec §7). */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { order: ['transition'] })
  const id = readIdParam(event, 'id', 'The order')
  const input = await readValidBody(event, collectOrderSchema)
  const order = await collectOrder(useDb(), actor, id, input)
  // The customer's linked chats hear it now, after the response (D28).
  const { botToken } = useRuntimeConfig(event).telegram
  if (botToken) event.waitUntil(deliverOrderSoon(useDb(), { botToken, orderId: id }))
  return order
})
