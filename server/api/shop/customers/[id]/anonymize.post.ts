import { anonymizeCustomerSchema } from '#shared/contracts/customers'
import { anonymizeCustomer } from '#server/features/customers'

/** Clears the customer's name, phone and note (spec P11). Owner only. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { customer: ['anonymize'] })
  const id = readIdParam(event, 'id', 'The customer')
  const input = await readValidBody(event, anonymizeCustomerSchema)
  return anonymizeCustomer(useDb(), actor, id, input)
})
