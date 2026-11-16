import type { OrderAction } from '#shared/contracts/orders'
import { apiError, ErrorCodes, notFound, versionConflict } from '#server/utils/errors'

/** Another shop's order answers the same as a missing one. */
export const orderNotFound = () => notFound('The order')
export const orderChanged = () => versionConflict('This order')

const ACTION_VERB: Record<OrderAction, string> = {
  start: 'started',
  ready: 'marked ready',
  rework: 'sent back to work',
  collect: 'collected',
  cancel: 'cancelled',
}

/** A move the state machine doesn't allow from the current status (spec §7). */
export function invalidTransition(action: OrderAction) {
  return apiError(409, ErrorCodes.INVALID_STATE, `This order can't be ${ACTION_VERB[action]} now.`)
}

/** Lines and the note change only while received or in progress (spec P6). */
export function orderNotEditable() {
  return apiError(409, ErrorCodes.INVALID_STATE, 'This order can no longer be edited.')
}

/** A paid order's lines stay as paid for: no refunds or top-ups in Phase 1 (D24). */
export function orderPaid() {
  return apiError(409, 'ORDER_PAID', 'This order is paid, so its lines can\'t change.')
}

/** `collect` of an unpaid order without `allowUnpaid` (spec §7). */
export function orderUnpaid() {
  return apiError(409, 'ORDER_UNPAID', 'This order isn\'t paid yet.')
}

export function alreadyPaid() {
  return apiError(409, 'ALREADY_PAID', 'This order is already paid.')
}

export function cancelledNoPayment() {
  return apiError(409, ErrorCodes.INVALID_STATE, 'A cancelled order can\'t be paid.')
}

/** The customer is missing, another shop's, or anonymized: all answer the same. */
export function customerUnavailable() {
  return apiError(409, 'CUSTOMER_UNAVAILABLE', 'Choose another customer.', { fieldErrors: { customer: ['Choose another customer'] } })
}

/** New lines come only from active price items of the shop; `paths` are the lines' fields. */
export function priceItemUnavailable(paths: string[]) {
  return apiError(409, 'PRICE_ITEM_UNAVAILABLE', 'A price on this order is no longer offered. Choose another.', {
    fieldErrors: Object.fromEntries(paths.map(path => [path, ['No longer offered']])),
  })
}

/** Field errors the contract can't check alone (a piece count over the limit, a line not on the order). */
export function invalidLines(fieldErrors: Record<string, string[]>) {
  return apiError(400, ErrorCodes.VALIDATION_FAILED, 'Some of the submitted data is invalid.', { fieldErrors })
}
