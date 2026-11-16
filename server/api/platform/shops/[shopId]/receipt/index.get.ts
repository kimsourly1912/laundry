import { getReceiptDesign } from '#server/features/receipts'
import { platformShopActor } from '#server/features/shops'

/** A shop's receipt design (D28): `{ design: null }` until a background is uploaded. */
export default defineEventHandler(async (event) => {
  const actor = await requirePlatformPermission(event, { receipt: ['read'] })
  const shopId = readIdParam(event, 'shopId', 'The shop')
  const db = useDb()
  return getReceiptDesign(db, await platformShopActor(db, actor, shopId))
})
