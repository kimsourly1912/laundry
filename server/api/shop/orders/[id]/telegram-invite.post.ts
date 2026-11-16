import { createInvite } from '#server/features/telegram'

/** A QR for the customer to link Telegram to this order (D28): a new one each time, valid a day. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { order: ['read'] })
  const id = readIdParam(event, 'id', 'The order')
  const { botUsername } = useRuntimeConfig(event).telegram
  return createInvite(useDb(), actor, id, { botUsername })
})
