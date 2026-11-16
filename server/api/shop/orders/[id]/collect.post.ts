import { collectOrderSchema } from '#shared/contracts/orders'
import { collectOrder } from '#server/features/orders'

/** Unpaid needs `allowUnpaid: true` (spec §7). */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { order: ['transition'] })
  const id = readIdParam(event, 'id', 'The order')
  const input = await readValidBody(event, collectOrderSchema)
  return collectOrder(useDb(), actor, id, input)
})
