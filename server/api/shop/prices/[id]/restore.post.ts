import { priceStatusSchema } from '#shared/contracts/prices'
import { setPriceActive } from '#server/features/prices'

/** `POST /api/shop/prices/:id/restore`: prices new orders again. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { price: ['write'] })
  const priceId = readIdParam(event, 'id', 'This price')
  const { version } = await readValidBody(event, priceStatusSchema)
  return setPriceActive(useDb(), actor, priceId, { version, active: true })
})
