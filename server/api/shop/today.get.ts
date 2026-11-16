import { getToday } from '#server/features/orders'

/** Today's counts and lists (spec §4), from Phnom Penh midnight. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { order: ['read'] })
  return getToday(useDb(), actor)
})
