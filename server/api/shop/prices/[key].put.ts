import * as v from 'valibot'
import { priceKeySchema, setPriceSchema } from '#shared/contracts/prices'
import { setPrice } from '#server/features/prices'

/** `PUT /api/shop/prices/:key`: the price of an item on the shop's slips (D43), at the version read. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { price: ['write'] })
  // A malformed key can't be on a slip: 404, as a missing item.
  const key = v.safeParse(priceKeySchema, getRouterParam(event, 'key') ?? '')
  if (!key.success) throw notFound('This item')
  const input = await readValidBody(event, setPriceSchema)
  return setPrice(useDb(), actor, key.output, input)
})
