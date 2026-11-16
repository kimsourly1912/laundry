import { orderActionSchema } from '#shared/contracts/orders'
import { transitionOrder } from '#server/features/orders'
import { deliverOrderSoon } from '#server/features/telegram'

export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { order: ['transition'] })
  const id = readIdParam(event, 'id', 'The order')
  const input = await readValidBody(event, orderActionSchema)
  const order = await transitionOrder(useDb(), actor, id, { action: 'ready', input })
  // The customer's linked chats hear it now, after the response (D28).
  const { botToken } = useRuntimeConfig(event).telegram
  if (botToken) event.waitUntil(deliverOrderSoon(useDb(), { botToken, orderId: id }))
  return order
})
