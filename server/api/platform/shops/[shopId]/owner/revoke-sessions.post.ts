import { revokeOwnerSessions } from '#server/features/shops'

/** "Sign owner out everywhere": every owner session ends. 204. */
export default defineEventHandler(async (event) => {
  const actor = await requirePlatformPermission(event, { owner: ['revoke-sessions'] })
  const shopId = readIdParam(event, 'shopId', 'The shop')
  await revokeOwnerSessions(useDb(), actor, shopId)
  setResponseStatus(event, 204)
  return null
})
