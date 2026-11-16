import { deleteVersionQuerySchema } from '#shared/contracts/common'
import { archiveServiceType } from '#server/features/pricing'
import { platformShopActor } from '#server/features/shops'

/** `DELETE …?version=`: archives (never deletes) a service type of the shop. */
export default defineEventHandler(async (event) => {
  const actor = await requirePlatformPermission(event, { price: ['write'] })
  const shopId = readIdParam(event, 'shopId', 'The shop')
  const id = readIdParam(event, 'id', 'The service type')
  const { version } = readValidQuery(event, deleteVersionQuerySchema)
  const db = useDb()
  return archiveServiceType(db, await platformShopActor(db, actor, shopId), id, version)
})
