import { deleteVersionQuerySchema } from '#shared/contracts/common'
import { archivePriceItem } from '#server/features/pricing'

/** `DELETE …?version=`: archives (never deletes) a price item. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { price: ['write'] })
  const id = readIdParam(event, 'id', 'The price item')
  const { version } = readValidQuery(event, deleteVersionQuerySchema)
  return archivePriceItem(useDb(), actor, id, version)
})
