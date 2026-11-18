import { updatePriceSchema } from '#shared/contracts/prices'
import { updatePrice } from '#server/features/prices'

/** `PATCH /api/shop/prices/:id`: label, unit and price at the version read. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { price: ['write'] })
  const priceId = readIdParam(event, 'id', 'This price')
  const input = await readValidBody(event, updatePriceSchema)
  return updatePrice(useDb(), actor, priceId, input)
})
