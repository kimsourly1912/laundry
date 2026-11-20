import { apiError, ErrorCodes, notFound } from '#server/utils/errors'
import type { FillProblems } from '#shared/slip/values'
import { fillProblemText } from '#shared/slip/values'

export const OrderErrorCodes = {
  SLIP_VALUES_INVALID: 'SLIP_VALUES_INVALID',
} as const

export function orderNotFound() {
  return notFound('This slip')
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

/** 422: the promised day is before the order's day. */
export function dueDateInPast() {
  return apiError(422, ErrorCodes.VALIDATION_FAILED, 'The pickup day can\'t be before today.', { fieldErrors: { dueDate: ['Not before today'] } })
}
