import { getCustomer } from '#server/features/customers'

/** `GET /api/shop/customers/:id`. Their orders: `GET /api/shop/orders?customerId=`. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { customer: ['read'] })
  const customerId = readIdParam(event, 'id', 'This customer')
  return getCustomer(useDb(), actor, customerId)
})
