import { updateServiceTypeSchema } from '#shared/contracts/pricing'
import { updateServiceType } from '#server/features/pricing'

export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { price: ['write'] })
  const id = readIdParam(event, 'id', 'The service type')
  const input = await readValidBody(event, updateServiceTypeSchema)
  return updateServiceType(useDb(), actor, id, input)
})
