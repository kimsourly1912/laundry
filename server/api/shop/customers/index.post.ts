import { customerInputSchema } from '#shared/contracts/customers'
import { createCustomer } from '#server/features/customers'

export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { customer: ['write'] })
  const input = await readValidBody(event, customerInputSchema)
  const created = await createCustomer(useDb(), actor, input)
  setResponseStatus(event, 201)
  return created
})
