import { orderTelegramStatus } from '#server/features/telegram'

/** Whether the order's customer gets it on Telegram, and what was sent (D28). */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { order: ['read'] })
  const id = readIdParam(event, 'id', 'The order')
  return orderTelegramStatus(useDb(), actor, id)
})
