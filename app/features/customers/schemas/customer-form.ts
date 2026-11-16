import * as v from 'valibot'
import type { Customer, customerInputSchema } from '#shared/contracts/customers'
import { CUSTOMER_NAME_MAX, CUSTOMER_NOTE_MAX } from '#shared/contracts/customers'
import { formatPhone, toE164 } from '#shared/contracts/phone'

/**
 * The customer form (docs/standards/forms.md): the contract's rules with messages in the user's
 * language. The phone is typed in any format; the server stores E.164.
 */

type Translate = (key: string, params?: Record<string, unknown>) => string

export interface CustomerForm {
  name: string
  phone: string
  note: string
}

export function customerFormSchema(t: Translate) {
  return v.object({
    name: v.pipe(v.string(), v.trim(), v.minLength(1, t('validation.required')), v.maxLength(CUSTOMER_NAME_MAX, t('validation.maxLength', { max: CUSTOMER_NAME_MAX }))),
    phone: v.pipe(v.string(), v.check(text => !text.trim() || toE164(text) !== null, t('validation.phoneNumber'))),
    note: v.pipe(v.string(), v.maxLength(CUSTOMER_NOTE_MAX, t('validation.maxLength', { max: CUSTOMER_NOTE_MAX }))),
  })
}

export function toCustomerForm(customer?: Customer): CustomerForm {
  return {
    name: customer?.name ?? '',
    phone: customer?.phone ? formatPhone(customer.phone) : '',
    note: customer?.note ?? '',
  }
}

export function toCustomerRequest(form: CustomerForm): v.InferInput<typeof customerInputSchema> {
  return { name: form.name, phone: form.phone, note: form.note }
}
