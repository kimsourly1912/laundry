import { previewReceiptSchema } from '#shared/contracts/receipts'
import { previewReceipt } from '#server/features/receipts'
import { platformShopActor } from '#server/features/shops'

/** The fields on screen, saved or not, rendered over the background with made-up values (D28). */
export default defineEventHandler(async (event) => {
  const actor = await requirePlatformPermission(event, { receipt: ['read'] })
  const shopId = readIdParam(event, 'shopId', 'The shop')
  const input = await readValidBody(event, previewReceiptSchema)
  const db = useDb()
  return imageResponse(await previewReceipt(db, await platformShopActor(db, actor, shopId), input), 'image/png')
})
