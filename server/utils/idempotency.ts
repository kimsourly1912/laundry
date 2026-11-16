import type { H3Event } from 'h3'
import { getHeader } from 'h3'
import * as v from 'valibot'
import { apiError, ErrorCodes } from './errors'

const keySchema = v.pipe(v.string(), v.uuid())

/**
 * The `Idempotency-Key` header (a UUID per user action, spec T10), required on order create and
 * payment record. Missing or not a UUID: `400 VALIDATION_FAILED`. The key's use is
 * `runIdempotent` (platform feature).
 *
 * @example const key = readIdempotencyKey(event)
 */
export function readIdempotencyKey(event: H3Event): string {
  const result = v.safeParse(keySchema, getHeader(event, 'idempotency-key'))
  if (!result.success) throw apiError(400, ErrorCodes.VALIDATION_FAILED, 'Send an Idempotency-Key header (a UUID) with this request.')
  return result.output.toLowerCase()
}
