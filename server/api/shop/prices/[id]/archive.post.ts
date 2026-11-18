import { priceStatusSchema } from '#shared/contracts/prices'
import { setPriceActive } from '#server/features/prices'

/** `POST /api/shop/prices/:id/archive`: no new order is priced by it; old orders keep their lines. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { price: ['write'] })
  const priceId = readIdParam(event, 'id', 'This price')
  const { version } = await readValidBody(event, priceStatusSchema)
  return setPriceActive(useDb(), actor, priceId, { version, active: false })
})
