import { deleteVersionQuerySchema } from '#shared/contracts/common'
import { archiveServiceType } from '#server/features/pricing'

/** `DELETE …?version=`: archives (never deletes) a service type with no active items. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { price: ['write'] })
  const id = readIdParam(event, 'id', 'The service type')
  const { version } = readValidQuery(event, deleteVersionQuerySchema)
  return archiveServiceType(useDb(), actor, id, version)
})
