import type { Page } from '#shared/contracts/common'
import type { Customer } from '#shared/contracts/customers'
import { toE164 } from '#shared/contracts/phone'

/**
 * After `409 PHONE_TAKEN` (spec §16): the customer who has the number, so the form can offer them
 * instead. `undefined` when it can't be found (anonymized meanwhile, or the search failed).
 */
export async function findCustomerByPhone(phone: string): Promise<Customer | undefined> {
  const e164 = toE164(phone)
  if (!e164) return undefined
  try {
    const page = await apiFetch<Page<Customer>>('/shop/customers', { query: { search: phone, pageSize: 20 } })
    return page.items.find(customer => customer.phone === e164)
  }
  catch {
    return undefined
  }
}
