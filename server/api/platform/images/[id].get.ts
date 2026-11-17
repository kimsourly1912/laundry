import { imageBytes } from '#server/features/templates'

/** The image's bytes as uploaded, with the type read from them at upload. */
export default defineEventHandler(async (event) => {
  await requirePlatformPermission(event, { template: ['read'] })
  const imageId = readIdParam(event, 'id', 'The image')
  const { bytes, type } = await imageBytes(useDb(), imageId)
  return imageResponse(bytes, type)
})
