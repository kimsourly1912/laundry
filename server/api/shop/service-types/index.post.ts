import { serviceTypeInputSchema } from '#shared/contracts/pricing'
import { createServiceType } from '#server/features/pricing'

export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { price: ['write'] })
  const input = await readValidBody(event, serviceTypeInputSchema)
  const created = await createServiceType(useDb(), actor, input)
  setResponseStatus(event, 201)
  return created
})
