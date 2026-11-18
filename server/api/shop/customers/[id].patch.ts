import { updateCustomerSchema } from '#shared/contracts/customers'
import { updateCustomer } from '#server/features/customers'

/** `PATCH /api/shop/customers/:id`: name and phone at the version read. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { customer: ['write'] })
  const customerId = readIdParam(event, 'id', 'This customer')
  const input = await readValidBody(event, updateCustomerSchema)
  return updateCustomer(useDb(), actor, customerId, input)
})
