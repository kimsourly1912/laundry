import { updateServiceTypeSchema } from '#shared/contracts/pricing'
import { updateServiceType } from '#server/features/pricing'
import { platformShopActor } from '#server/features/shops'

export default defineEventHandler(async (event) => {
  const actor = await requirePlatformPermission(event, { price: ['write'] })
  const shopId = readIdParam(event, 'shopId', 'The shop')
  const id = readIdParam(event, 'id', 'The service type')
  const input = await readValidBody(event, updateServiceTypeSchema)
  const db = useDb()
  return updateServiceType(db, await platformShopActor(db, actor, shopId), id, input)
})
