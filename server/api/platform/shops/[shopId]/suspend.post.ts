import { shopStatusChangeSchema } from '#shared/contracts/platform-shops'
import { suspendShop } from '#server/features/shops'

export default defineEventHandler(async (event) => {
  const actor = await requirePlatformPermission(event, { shop: ['suspend'] })
  const shopId = readIdParam(event, 'shopId', 'The shop')
  const input = await readValidBody(event, shopStatusChangeSchema)
  return suspendShop(useDb(), actor, shopId, input)
})
