import { createCustomerSchema } from '#shared/contracts/customers'
import { createCustomer } from '#server/features/customers'

/** `POST /api/shop/customers`: 201 with the new customer. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { customer: ['write'] })
  const input = await readValidBody(event, createCustomerSchema)
  const customer = await createCustomer(useDb(), actor, input)
  setResponseStatus(event, 201)
  return customer
})
