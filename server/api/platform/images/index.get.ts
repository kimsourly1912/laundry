import { imageListQuerySchema } from '#shared/contracts/templates'
import { listImages } from '#server/features/templates'

export default defineEventHandler(async (event) => {
  await requirePlatformPermission(event, { template: ['read'] })
  const query = readValidQuery(event, imageListQuerySchema)
  return listImages(useDb(), query)
})
