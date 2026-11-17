import { IMAGE_MAX_BYTES, uploadImageQuerySchema } from '#shared/contracts/templates'
import { uploadImage } from '#server/features/templates'

/**
 * An image as the request body (plan §5.9): PNG or JPEG, up to 1 MB (the Worker allows this path
 * that much, server/utils/worker-body.ts). Its type comes from its bytes, never from `Content-Type`.
 */
export default defineEventHandler(async (event) => {
  const actor = await requirePlatformPermission(event, { template: ['write'] })
  const { name } = readValidQuery(event, uploadImageQuerySchema)
  const bytes = await readLimitedBody(event, IMAGE_MAX_BYTES)
  setResponseStatus(event, 201)
  return uploadImage(useDb(), actor, { bytes, name })
})
