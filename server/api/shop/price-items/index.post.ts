import { priceItemInputSchema } from '#shared/contracts/pricing'
import { createPriceItem } from '#server/features/pricing'

export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { price: ['write'] })
  const input = await readValidBody(event, priceItemInputSchema)
  const created = await createPriceItem(useDb(), actor, input)
  setResponseStatus(event, 201)
  return created
})
