import type { H3Event } from 'h3'
import { getQuery, getRouterParam } from 'h3'
import * as v from 'valibot'
import { apiError, ErrorCodes } from './errors'
import { readLimitedBody } from './request-body'

/** Largest JSON body a route accepts (docs/server/security.md → Request protection). */
export const MAX_JSON_BYTES = 64 * 1024

/**
 * Validates input with a Valibot schema, or throws `400 VALIDATION_FAILED` with the messages per
 * field path (`name`, `lines.0.quantity`). Issues without a path are under `''`.
 */
export function parseInput<T extends v.GenericSchema>(schema: T, input: unknown): v.InferOutput<T> {
  const result = v.safeParse(schema, input)
  if (result.success) return result.output
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of result.issues) {
    const path = v.getDotPath(issue) ?? ''
    ;(fieldErrors[path] ??= []).push(issue.message)
  }
  throw apiError(400, ErrorCodes.VALIDATION_FAILED, 'Some of the submitted data is invalid.', { fieldErrors })
}

interface BodyOptions {
  /**
   * A larger limit for a route that needs one (the studio's design, `MAX_DESIGN_BYTES`). The Worker's
   * own cap for the path (`workerBodyLimit`) must allow it too.
   */
  maxBytes?: number
}

/** The JSON body, size-limited (`MAX_JSON_BYTES` unless the route says) and validated. An empty body validates as `{}`. */
export async function readValidBody<T extends v.GenericSchema>(event: H3Event, schema: T, options: BodyOptions = {}): Promise<v.InferOutput<T>> {
  const { maxBytes = MAX_JSON_BYTES } = options
  const bytes = await readLimitedBody(event, maxBytes)
  let body: unknown
  try {
    body = bytes.length ? JSON.parse(new TextDecoder().decode(bytes)) : {}
  }
  catch {
    throw apiError(400, ErrorCodes.VALIDATION_FAILED, 'The request body is not valid JSON.')
  }
  return parseInput(schema, body ?? {})
}

/** The query string, validated. Values arrive as strings: use coercing schemas for numbers. */
export function readValidQuery<T extends v.GenericSchema>(event: H3Event, schema: T): v.InferOutput<T> {
  return parseInput(schema, getQuery<Record<string, unknown>>(event))
}

const uuidSchema = v.pipe(v.string(), v.uuid())

/**
 * A route parameter that must be an id (UUID). Anything else is 404, not 400: a malformed id can't
 * name an existing record, and we don't explain id formats to callers.
 *
 * @example const orderId = readIdParam(event, 'id', 'The order')
 */
export function readIdParam(event: H3Event, name: string, what: string): string {
  const result = v.safeParse(uuidSchema, getRouterParam(event, name))
  if (!result.success) throw apiError(404, ErrorCodes.NOT_FOUND, `${what} was not found.`)
  return result.output
}
