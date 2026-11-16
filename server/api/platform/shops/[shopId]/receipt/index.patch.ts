import { updateReceiptSchema } from '#shared/contracts/receipts'
import { updateReceiptFields } from '#server/features/receipts'
import { platformShopActor } from '#server/features/shops'

/** Saves the design's fields, at the version read (D28). */
export default defineEventHandler(async (event) => {
  const actor = await requirePlatformPermission(event, { receipt: ['write'] })
  const shopId = readIdParam(event, 'shopId', 'The shop')
  const input = await readValidBody(event, updateReceiptSchema)
  const db = useDb()
  return updateReceiptFields(db, await platformShopActor(db, actor, shopId), input)
})
