import { receiptBackground } from '#server/features/receipts'
import { platformShopActor } from '#server/features/shops'

/** The receipt's background image, for the designer (D28). */
export default defineEventHandler(async (event) => {
  const actor = await requirePlatformPermission(event, { receipt: ['read'] })
  const shopId = readIdParam(event, 'shopId', 'The shop')
  const db = useDb()
  const { bytes, type } = await receiptBackground(db, await platformShopActor(db, actor, shopId))
  return imageResponse(bytes, type)
})
