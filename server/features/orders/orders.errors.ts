import { apiError, ErrorCodes, notFound, versionConflict } from '#server/utils/errors'
import type { FillProblems } from '#shared/slip/values'
import { fillProblemText } from '#shared/slip/values'

export const OrderErrorCodes = {
  SLIP_VALUES_INVALID: 'SLIP_VALUES_INVALID',
  QUOTE_CHANGED: 'QUOTE_CHANGED',
} as const

export function orderNotFound() {
  return notFound('This order')
}

/**
 * 422: a value doesn't fit the order's template version (plan §6.8). `fieldErrors` names each by its
 * path in the request: `values.<key>`, `phone`, `amount`.
 */
export function slipValuesInvalid(problems: FillProblems) {
  const fieldErrors: Record<string, string[]> = {}
  for (const [key, problem] of Object.entries(problems)) {
    const path = key === 'phone' || key === 'amount' ? key : `values.${key}`
    fieldErrors[path] = [fillProblemText(problem)]
  }
  return apiError(422, OrderErrorCodes.SLIP_VALUES_INVALID, 'Some boxes of the slip need a look.', { fieldErrors })
}

export function orderChanged() {
  return versionConflict('This order')
}

const STATE_MESSAGES = {
  'start': 'Work on this order has already started, or it is closed.',
  'ready': 'This order is already ready, or it is closed.',
  'rework': 'This order is not ready.',
  'pay': 'This order is already paid or cancelled.',
  'pick-up': 'Only a ready order can be picked up.',
  'cancel': 'This order was already picked up or cancelled.',
} as const

/** 409 `INVALID_STATE`: the action doesn't apply to the order as it is now. */
export function orderNotAllowed(action: keyof typeof STATE_MESSAGES) {
  return apiError(409, ErrorCodes.INVALID_STATE, STATE_MESSAGES[action])
}

const LINE_TEXT = {
  noPrice: 'Not in your price list',
  wholePieces: 'A whole number of pieces',
} as const

/** 422: a priced field's key has no active price in the shop, or a piece count isn't whole (D39). */
export function linesInvalid(problems: Record<string, keyof typeof LINE_TEXT>) {
  const fieldErrors = Object.fromEntries(Object.entries(problems).map(([fieldId, problem]) => [`values.${fieldId}`, [LINE_TEXT[problem]]]))
  return apiError(422, OrderErrorCodes.SLIP_VALUES_INVALID, 'Some items can\'t be priced.', { fieldErrors })
}

/**
 * 409: the amount the owner saw isn't the server's total (a price changed meanwhile). The app
 * reloads the price list and shows the new total before saving (product notes: "return the updated
 * quote for owner review").
 */
export function quoteChanged(total: number) {
  return apiError(409, OrderErrorCodes.QUOTE_CHANGED, `A price changed: the total is now ${total}. Check it and save again.`)
}

/** 422: the promised day is before the order's day. */
export function dueDateInPast() {
  return apiError(422, ErrorCodes.VALIDATION_FAILED, 'The pickup day can\'t be before today.', { fieldErrors: { dueDate: ['Not before today'] } })
}
