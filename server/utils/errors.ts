import { createError, isError } from 'h3'
import type { ApiErrorBody } from '#shared/contracts/common'

/**
 * Error codes shared by every feature (docs/server/architecture.md → Errors). A feature's own codes
 * live in its `*.errors.ts`. The HTTP status says the kind; the code says the reason.
 */
export const ErrorCodes = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  NO_SHOP: 'NO_SHOP',
  SHOP_SUSPENDED: 'SHOP_SUSPENDED',
  NOT_FOUND: 'NOT_FOUND',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  INVALID_STATE: 'INVALID_STATE',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  IDEMPOTENCY_MISMATCH: 'IDEMPOTENCY_MISMATCH',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const

interface ApiErrorOptions {
  fieldErrors?: Record<string, string[]>
}

/**
 * Creates (for `throw`) an API error: the HTTP status plus `{ code, message, fieldErrors? }`.
 * `message` must be safe to show to users: never internals, never secrets.
 *
 * @example throw apiError(409, 'VERSION_CONFLICT', 'This order was changed on another device. Reload and try again.')
 */
export function apiError(statusCode: number, code: string, message: string, options: ApiErrorOptions = {}) {
  const { fieldErrors } = options
  const data: ApiErrorBody = fieldErrors ? { code, message, fieldErrors } : { code, message }
  return createError({ statusCode, message, data })
}

/** `404 NOT_FOUND` naming the record type: also the answer for another shop's record. */
export function notFound(what: string) {
  return apiError(404, ErrorCodes.NOT_FOUND, `${what} was not found.`)
}

/** `409 VERSION_CONFLICT` naming the record type. */
export function versionConflict(what: string) {
  return apiError(409, ErrorCodes.VERSION_CONFLICT, `${what} was changed on another device. Reload and try again.`)
}

/** Default codes for errors thrown without one (h3's own 404/405, a library's 401…). */
function codeForStatus(status: number): string {
  if (status === 400 || status === 422) return ErrorCodes.VALIDATION_FAILED
  if (status === 401) return ErrorCodes.UNAUTHENTICATED
  if (status === 403) return ErrorCodes.FORBIDDEN
  if (status === 404 || status === 405) return ErrorCodes.NOT_FOUND
  if (status === 409) return ErrorCodes.VERSION_CONFLICT
  if (status === 413) return ErrorCodes.PAYLOAD_TOO_LARGE
  if (status === 429) return ErrorCodes.RATE_LIMITED
  return ErrorCodes.INTERNAL
}

const GENERIC_MESSAGE: Record<number, string> = {
  400: 'Some of the submitted data is invalid.',
  401: 'Sign in to continue.',
  403: 'You don\'t have permission to do this.',
  404: 'Not found.',
  405: 'Not found.',
  413: 'The request is too large.',
  429: 'Too many requests. Wait a minute and try again.',
}

const INTERNAL_MESSAGE = 'Something went wrong on our side. Please try again.'

function isApiErrorBody(data: unknown): data is ApiErrorBody {
  if (typeof data !== 'object' || data === null) return false
  const { code, message } = data as Record<string, unknown>
  return typeof code === 'string' && typeof message === 'string'
}

export interface ErrorResponse {
  status: number
  body: ApiErrorBody
  /** 5xx: our fault; the caller logs the cause. */
  isServerError: boolean
}

/**
 * The response for any error thrown while handling an `/api` request (server/error-handler.ts):
 * - 4xx `apiError`s go out as they are, plus the request id;
 * - other 4xx (h3's, libraries') get a shared code and a generic message;
 * - **5xx never carry details**: a fixed message and code `INTERNAL`; the cause is logged instead.
 */
export function toErrorResponse(error: unknown, requestId?: string): ErrorResponse {
  const status = isError(error) && error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500
  const isServerError = status >= 500
  let body: ApiErrorBody
  if (isServerError) {
    body = { code: ErrorCodes.INTERNAL, message: INTERNAL_MESSAGE }
  }
  else if (isError(error) && isApiErrorBody(error.data)) {
    const { code, message, fieldErrors } = error.data
    body = fieldErrors ? { code, message, fieldErrors } : { code, message }
  }
  else {
    body = { code: codeForStatus(status), message: GENERIC_MESSAGE[status] ?? 'The request could not be completed.' }
  }
  return { status, isServerError, body: requestId ? { ...body, requestId } : body }
}
