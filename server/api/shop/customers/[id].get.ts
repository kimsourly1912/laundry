import { getCustomer } from '#server/features/customers'

export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { customer: ['read'] })
  const id = readIdParam(event, 'id', 'The customer')
  return getCustomer(useDb(), actor, id)
})
