import { createRequestQuerySchema } from '#shared/contracts/template-requests'
import { IMAGE_MAX_BYTES } from '#shared/contracts/templates'
import { createRequest } from '#server/features/templates'

/**
 * `POST /api/shop/template-requests?kind=&notes=`: a redesign request; the photo is the body (PNG or
 * JPEG, ≤ 1 MB, the Worker allows this path that much). Its type comes from its bytes. 201.
 */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { template: ['request'] })
  const query = readValidQuery(event, createRequestQuerySchema)
  const bytes = await readLimitedBody(event, IMAGE_MAX_BYTES)
  setResponseStatus(event, 201)
  return createRequest(useDb(), actor, { bytes, query })
})
