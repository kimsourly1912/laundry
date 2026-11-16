/** The customers feature's public API (docs/server/architecture.md → Features). */
export { anonymizeCustomer, createCustomer, getCustomer, listCustomers, phoneSearchDigits, requireActiveCustomerStatement, updateCustomer } from './customers.service'
/**
 * For a read-only join (docs/server/repositories.md → Other features' tables): an order's customer
 * in lists and search. Others read only `id`, `shopId`, `name`, `phoneE164`, `anonymizedAt`, and
 * never write it.
 */
export { customers as customersTable } from './customers.schema'
