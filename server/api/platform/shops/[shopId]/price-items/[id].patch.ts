import { updatePriceItemSchema } from '#shared/contracts/pricing'
import { updatePriceItem } from '#server/features/pricing'
import { platformShopActor } from '#server/features/shops'

export default defineEventHandler(async (event) => {
  const actor = await requirePlatformPermission(event, { price: ['write'] })
  const shopId = readIdParam(event, 'shopId', 'The shop')
  const id = readIdParam(event, 'id', 'The price item')
  const input = await readValidBody(event, updatePriceItemSchema)
  const db = useDb()
  return updatePriceItem(db, await platformShopActor(db, actor, shopId), id, input)
})
