import { serviceTypeInputSchema } from '#shared/contracts/pricing'
import { createServiceType } from '#server/features/pricing'
import { platformShopActor } from '#server/features/shops'

export default defineEventHandler(async (event) => {
  const actor = await requirePlatformPermission(event, { price: ['write'] })
  const shopId = readIdParam(event, 'shopId', 'The shop')
  const input = await readValidBody(event, serviceTypeInputSchema)
  const db = useDb()
  const created = await createServiceType(db, await platformShopActor(db, actor, shopId), input)
  setResponseStatus(event, 201)
  return created
})
