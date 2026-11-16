import { updateCustomerSchema } from '#shared/contracts/customers'
import { updateCustomer } from '#server/features/customers'

export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { customer: ['write'] })
  const id = readIdParam(event, 'id', 'The customer')
  const input = await readValidBody(event, updateCustomerSchema)
  return updateCustomer(useDb(), actor, id, input)
})
