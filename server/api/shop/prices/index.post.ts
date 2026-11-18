import { createPriceSchema } from '#shared/contracts/prices'
import { createPrice } from '#server/features/prices'

/** `POST /api/shop/prices`: 201 with the new item. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { price: ['write'] })
  const input = await readValidBody(event, createPriceSchema)
  const item = await createPrice(useDb(), actor, input)
  setResponseStatus(event, 201)
  return item
})
