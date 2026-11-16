import { resetOwnerPasswordSchema } from '#shared/contracts/platform-shops'
import { resetOwnerPassword } from '#server/features/shops'

/** A new temporary password for the owner, and every owner session ended. 204. */
export default defineEventHandler(async (event) => {
  const actor = await requirePlatformPermission(event, { owner: ['reset-password'] })
  const shopId = readIdParam(event, 'shopId', 'The shop')
  const input = await readValidBody(event, resetOwnerPasswordSchema)
  await resetOwnerPassword(useDb(), actor, shopId, input)
  setResponseStatus(event, 204)
  return null
})
