import { customerListQuerySchema } from '#shared/contracts/customers'
import { listCustomers } from '#server/features/customers'

/** `GET /api/shop/customers?search=&page=`: the shop's customers, by name or phone digits. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { customer: ['read'] })
  const query = readValidQuery(event, customerListQuerySchema)
  return listCustomers(useDb(), actor, query)
})
