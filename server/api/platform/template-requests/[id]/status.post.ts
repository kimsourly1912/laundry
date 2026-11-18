import { requestStatusSchema } from '#shared/contracts/template-requests'
import { setRequestStatus } from '#server/features/templates'

/** `POST /api/platform/template-requests/:id/status`: in progress, done (naming the template), or declined; at the version read. */
export default defineEventHandler(async (event) => {
  const actor = await requirePlatformPermission(event, { template: ['write'] })
  const requestId = readIdParam(event, 'id', 'This request')
  const input = await readValidBody(event, requestStatusSchema)
  return setRequestStatus(useDb(), actor, requestId, input)
})
