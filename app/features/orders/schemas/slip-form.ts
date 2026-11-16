import type * as v from 'valibot'
import type { createOrderSchema, OrderCustomer } from '#shared/contracts/orders'
import { lineTotal, MAX_ORDER_LINES, ORDER_CUSTOMER_NAME_MAX } from '#shared/contracts/orders'
import type { PriceItem } from '#shared/contracts/pricing'
import { formatPhone, toE164 } from '#shared/contracts/phone'
import { parseQuantity } from './order-lines'

/**
 * The order form shaped like the shop's paper slip (D27): the person's phone and name (both
 * optional), a box per price item for its pieces or kilograms, a note, paid or not. A blank box is
 * an item not taken. The server prices and totals again; this is the preview and the messages.
 */

type Translate = (key: string, params?: Record<string, unknown>) => string

export interface SlipForm {
  phone: string
  name: string
  /** As typed, by price item id: pieces (`3`) or kilograms (`2.5`); blank: none. */
  quantities: Record<string, string>
  note: string
  paid: boolean
}

export function emptySlip(): SlipForm {
  return { phone: '', name: '', quantities: {}, note: '', paid: false }
}

type SlipItem = Pick<PriceItem, 'id' | 'unit' | 'price'>

/** The boxes filled in, in price list order: what the order's lines will be. */
function filled(form: SlipForm, items: readonly SlipItem[]) {
  return items.flatMap((item) => {
    const text = form.quantities[item.id]?.trim() ?? ''
    return text ? [{ item, text }] : []
  })
}

/** One more or one fewer piece; blank below 1. Kilograms are typed, not stepped. */
export function stepPieces(text: string | undefined, step: 1 | -1): string {
  const current = parseQuantity('piece', text ?? '') ?? 0
  const next = Math.max(0, current + step)
  return next ? String(next) : ''
}

/** The preview total: the boxes that hold a valid quantity. */
export function slipTotal(form: SlipForm, items: readonly SlipItem[]): number {
  return filled(form, items).reduce((sum, { item, text }) => {
    const quantity = parseQuantity(item.unit, text)
    return sum + (quantity === null ? 0 : lineTotal(item.unit, quantity, item.price))
  }, 0)
}

/** How many boxes are filled among `ids` (a service tab's count). */
export function filledCount(form: SlipForm, ids: readonly string[]): number {
  return ids.filter(id => form.quantities[id]?.trim()).length
}

/** Errors on their fields: `phone`, `name`, `quantities.<item id>`, and `quantities` for none at all. */
export function slipErrors(form: SlipForm, items: readonly SlipItem[], t: Translate): { name: string, message: string }[] {
  const errors: { name: string, message: string }[] = []
  if (form.phone.trim() && !toE164(form.phone)) errors.push({ name: 'phone', message: t('validation.phoneNumber') })
  if (form.name.trim().length > ORDER_CUSTOMER_NAME_MAX) errors.push({ name: 'name', message: t('validation.maxLength', { max: ORDER_CUSTOMER_NAME_MAX }) })
  const lines = filled(form, items)
  for (const { item, text } of lines) {
    if (parseQuantity(item.unit, text) === null) errors.push({ name: `quantities.${item.id}`, message: t(item.unit === 'piece' ? 'orders.lines.invalidPieces' : 'orders.lines.invalidKg') })
  }
  if (!lines.length) errors.push({ name: 'quantities', message: t('orders.slip.nothing') })
  else if (lines.length > MAX_ORDER_LINES) errors.push({ name: 'quantities', message: t('orders.slip.tooMany', { max: MAX_ORDER_LINES }) })
  return errors
}

/**
 * `POST /api/shop/orders`. Call with a form that has no errors. The phone and name go as typed:
 * the server finds the customer with that phone or makes one, or a walk-in without a phone.
 */
export function toSlipRequest(form: SlipForm, items: readonly SlipItem[]): v.InferInput<typeof createOrderSchema> {
  return {
    customer: { kind: 'counter', phone: form.phone.trim(), name: form.name.trim() },
    lines: filled(form, items).map(({ item, text }) => ({ priceItemId: item.id, quantity: parseQuantity(item.unit, text)! })),
    note: form.note,
    paid: form.paid,
  }
}

/** Who the order is for, in one line: the name, else the phone, else "Walk-in" (D27). */
export function customerLabel(customer: OrderCustomer, t: Translate): string {
  if (customer.anonymized) return t('customers.former')
  if (customer.name) return customer.name
  if (customer.phone) return formatPhone(customer.phone)
  return t('orders.walkIn')
}
