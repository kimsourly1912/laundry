import { apiError, ErrorCodes, notFound, versionConflict } from '#server/utils/errors'
import type { FillProblems } from '#shared/slip/values'
import { fillProblemText } from '#shared/slip/values'

export const OrderErrorCodes = {
  SLIP_VALUES_INVALID: 'SLIP_VALUES_INVALID',
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
  'pay': 'This order is already paid or cancelled.',
  'pick-up': 'This order was already picked up or cancelled.',
  'cancel': 'This order was already picked up or cancelled.',
} as const

/** 409 `INVALID_STATE`: the action doesn't apply to the order as it is now. */
export function orderNotAllowed(action: keyof typeof STATE_MESSAGES) {
  return apiError(409, ErrorCodes.INVALID_STATE, STATE_MESSAGES[action])
}
