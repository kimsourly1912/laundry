import * as v from 'valibot'
import { nameSchema, optionalParam, optionalTextSchema, pageQuerySchema, versionSchema } from './common'
import { optionalPhoneSchema } from './phone'

/**
 * A shop's customers (`/api/shop/customers`, spec §9, step M2.2). A customer may have no phone
 * (their Telegram link is then for one order only, M4). Never deleted: anonymized.
 */

export const CUSTOMER_NAME_MAX = 100
export const CUSTOMER_NOTE_MAX = 500

const fields = {
  name: nameSchema(CUSTOMER_NAME_MAX, 'Name'),
  phone: optionalPhoneSchema,
  note: optionalTextSchema(CUSTOMER_NOTE_MAX),
}

export const customerInputSchema = v.strictObject(fields)
export type CustomerInput = v.InferOutput<typeof customerInputSchema>

export const updateCustomerSchema = v.strictObject({ ...fields, version: versionSchema })
export type UpdateCustomerInput = v.InferOutput<typeof updateCustomerSchema>

export const anonymizeCustomerSchema = v.strictObject({ version: versionSchema })
export type AnonymizeCustomerInput = v.InferOutput<typeof anonymizeCustomerSchema>

/** `GET …?search=&page=`: a name, or at least 3 digits of a phone number, in any format. */
export const customerListQuerySchema = v.object({
  ...pageQuerySchema,
  search: optionalParam(v.pipe(v.string(), v.trim(), v.maxLength(100))),
})
export type CustomerListQuery = v.InferOutput<typeof customerListQuerySchema>

export interface Customer {
  id: string
  /** Empty once anonymized: the app shows "Former customer". */
  name: string
  /** E.164, or `null`. */
  phone: string | null
  note: string | null
  anonymized: boolean
  /** ISO 8601. */
  createdAt: string
  version: number
}
