import * as v from 'valibot'
import { nameSchema, optionalParam, pageQuerySchema, versionSchema } from './common'
import { optionalPhoneSchema } from './phone'

/**
 * The shop's customers (`/api/shop/customers`, D39; product notes → customers): a name and an
 * optional phone, looked up at the counter and kept with their orders. One phone per customer in a
 * shop; another shop may have the same person.
 */

export const CUSTOMER_NAME_MAX = 80

/** `POST /api/shop/customers`. The phone as typed; stored as E.164. */
export const createCustomerSchema = v.strictObject({
  name: nameSchema(CUSTOMER_NAME_MAX, 'Name'),
  phone: optionalPhoneSchema,
})
export type CreateCustomerInput = v.InferOutput<typeof createCustomerSchema>

/** `PATCH /api/shop/customers/:id`: both fields, at the version read. */
export const updateCustomerSchema = v.strictObject({
  version: versionSchema,
  name: nameSchema(CUSTOMER_NAME_MAX, 'Name'),
  phone: optionalPhoneSchema,
})
export type UpdateCustomerInput = v.InferOutput<typeof updateCustomerSchema>

/** `GET /api/shop/customers?search=`: a phone (exact) or part of the name; by name. */
export const customerListQuerySchema = v.object({
  ...pageQuerySchema,
  search: optionalParam(v.pipe(v.string(), v.trim(), v.maxLength(CUSTOMER_NAME_MAX))),
})
export type CustomerListQuery = v.InferOutput<typeof customerListQuerySchema>

export interface Customer {
  id: string
  name: string
  /** E.164, or `null`. */
  phone: string | null
  version: number
  /** ISO 8601. */
  createdAt: string
}
