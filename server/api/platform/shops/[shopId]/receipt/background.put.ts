import { backgroundQuerySchema, MAX_RECEIPT_IMAGE_BYTES } from '#shared/contracts/receipts'
import { uploadReceiptBackground } from '#server/features/receipts'
import { platformShopActor } from '#server/features/shops'

/**
 * The receipt's background image as the request body (D28): PNG or JPEG, up to 1 MB (the Worker
 * allows this path that much, server/utils/worker-body.ts). Without `?version=` it makes the
 * shop's design; with it, it replaces the image of the design at that version.
 */
export default defineEventHandler(async (event) => {
  const actor = await requirePlatformPermission(event, { receipt: ['write'] })
  const shopId = readIdParam(event, 'shopId', 'The shop')
  const { version } = readValidQuery(event, backgroundQuerySchema)
  const bytes = await readLimitedBody(event, MAX_RECEIPT_IMAGE_BYTES)
  const db = useDb()
  return uploadReceiptBackground(db, await platformShopActor(db, actor, shopId), { bytes, version })
})
