import * as v from 'valibot'

/**
 * The body of every `/api/**` error response (spec §9): HTTP status = the kind, `code` = the reason.
 * `message` is written for the user. `fieldErrors` maps a field path (`lines.0.quantity`) to its
 * messages. `requestId` leads a screenshot of the error to the server's log lines.
 */
export interface ApiErrorBody {
  code: string
  message: string
  fieldErrors?: Record<string, string[]>
  requestId?: string
}

// --- Building blocks of request schemas (Valibot) ---

/** A record's `version` as an edit sends it back (409 `VERSION_CONFLICT` when stale). */
export const versionSchema = v.pipe(v.number(), v.integer(), v.minValue(1))

/** Required text, trimmed: `label` names the field in its empty message ("Shop name is required"). */
export function nameSchema(max: number, label: string) {
  return v.pipe(v.string(), v.trim(), v.minLength(1, `${label} is required`), v.maxLength(max, `At most ${max} characters`))
}

/** A query-string integer: query values arrive as strings. */
export function intParam(min: number, max: number) {
  return v.pipe(v.string(), v.regex(/^\d+$/, 'Must be a whole number'), v.transform(Number), v.minValue(min), v.maxValue(max))
}

/** An optional query-string filter: `''` counts as absent (a cleared search box). */
export function optionalParam<T extends v.GenericSchema<string, unknown>>(schema: T) {
  return v.optional(v.pipe(v.string(), v.transform(value => value || undefined), v.optional(schema)))
}

// --- Lists (spec §9 → Response rules) ---

export const MAX_PAGE_SIZE = 100

/** `?page=&pageSize=`, 1-based, 20 a page unless asked. Spread into a list's query schema. */
export const pageQuerySchema = {
  page: v.optional(intParam(1, 100_000), '1'),
  pageSize: v.optional(intParam(1, MAX_PAGE_SIZE), '20'),
}

export interface PageQuery {
  page: number
  pageSize: number
}

/** A list's response: one page of `items`, and how many match in all. */
export interface Page<T> {
  items: T[]
  /** 1-based. */
  page: number
  pageSize: number
  total: number
}

/** A page's response from its items, the query that asked and how many match. */
export function toPage<T>(items: T[], query: PageQuery, total: number): Page<T> {
  return { items, page: query.page, pageSize: query.pageSize, total }
}
