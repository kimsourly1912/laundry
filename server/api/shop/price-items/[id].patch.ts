import { updatePriceItemSchema } from '#shared/contracts/pricing'
import { updatePriceItem } from '#server/features/pricing'

export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { price: ['write'] })
  const id = readIdParam(event, 'id', 'The price item')
  const input = await readValidBody(event, updatePriceItemSchema)
  return updatePriceItem(useDb(), actor, id, input)
})
