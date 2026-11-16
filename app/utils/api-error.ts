import type { FetchError } from 'ofetch'

/**
 * The one error type the app's API layer throws (docs/reference/api-client.md), however the request
 * failed: an HTTP error from our API or Better Auth, no response, a timeout, or a response dropped
 * because the session changed meanwhile.
 */
export type ApiErrorKind
  = | 'network' // no response: offline, DNS
    | 'timeout'
    | 'aborted' // dropped on purpose (the session changed); never shown
    | 'unauthorized' // 401: no session, expired or revoked
    | 'forbidden'
    | 'not_found'
    | 'validation'
    | 'conflict'
    | 'rate_limited'
    | 'server' // 5xx
    | 'unknown'

/** Kinds whose server message is written for the user (our API's 4xx messages, spec §9). */
const USER_FACING = new Set<ApiErrorKind>(['forbidden', 'not_found', 'validation', 'conflict', 'rate_limited'])

function kindOf(status: number): ApiErrorKind {
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  if (status === 409) return 'conflict'
  if (status === 429) return 'rate_limited'
  if (status === 408 || status === 504) return 'timeout'
  if (status >= 500) return 'server'
  if (status >= 400) return 'validation'
  return 'unknown'
}

/** `fetch` rejects with a TypeError when there's no response; the message differs per browser. */
const NETWORK_MESSAGES = ['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed', 'fetch failed']
const isNetworkTypeError = (error: Error) => error instanceof TypeError && NETWORK_MESSAGES.some(message => error.message.startsWith(message))

/** Duck-typed: Vite can load two copies of ofetch, each with its own `FetchError` class. */
function isFetchError(error: unknown): error is FetchError {
  return error instanceof Error && error.name === 'FetchError'
}

interface ErrorBody {
  code?: string
  message?: string
  fieldErrors?: Record<string, string[]>
}

/** Our API: `{ data: { code, message, fieldErrors? } }` (h3). Better Auth: `{ code, message }`. */
function bodyOf(raw: unknown): ErrorBody {
  if (typeof raw !== 'object' || raw === null) return {}
  const data = (raw as { data?: unknown }).data
  const source = (typeof data === 'object' && data !== null && 'code' in data ? data : raw) as Record<string, unknown>
  return {
    code: typeof source.code === 'string' ? source.code : undefined,
    message: typeof source.message === 'string' && source.message ? source.message : undefined,
    fieldErrors: typeof source.fieldErrors === 'object' && source.fieldErrors !== null ? source.fieldErrors as Record<string, string[]> : undefined,
  }
}

interface ApiErrorOptions {
  kind: ApiErrorKind
  /** 0 without a response. */
  status: number
  /** The server's reason (`VERSION_CONFLICT`, `INVALID_USERNAME_OR_PASSWORD`). */
  code?: string
  /** The server's message when it is meant for users; else undefined (the app shows its own text). */
  serverMessage?: string
  fieldErrors?: Record<string, string[]>
  cause?: unknown
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number
  readonly code?: string
  readonly serverMessage?: string
  readonly fieldErrors?: Record<string, string[]>

  constructor(options: ApiErrorOptions) {
    super(options.serverMessage ?? options.code ?? options.kind, { cause: options.cause })
    this.name = 'ApiError'
    this.kind = options.kind
    this.status = options.status
    this.code = options.code
    this.serverMessage = options.serverMessage
    this.fieldErrors = options.fieldErrors
  }

  /** Worth a "Try again": the request may succeed as it is. */
  get retryable(): boolean {
    return this.kind === 'network' || this.kind === 'timeout' || this.kind === 'server'
  }

  /** Anything thrown → `ApiError`. Walks the `cause` chain: `useAsyncData` wraps errors. */
  static from(error: unknown): ApiError {
    for (let e: unknown = error, depth = 0; e && depth < 6; e = (e as { cause?: unknown }).cause, depth++) {
      if (e instanceof ApiError) return e
      if (isFetchError(e)) {
        if (!e.response) return ApiError.withoutResponse(e.cause ?? e)
        const status = e.response.status
        const kind = kindOf(status)
        const body = bodyOf(e.data)
        return new ApiError({ kind, status, code: body.code, serverMessage: USER_FACING.has(kind) ? body.message : undefined, fieldErrors: body.fieldErrors, cause: e })
      }
      if (e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError' || isNetworkTypeError(e))) return ApiError.withoutResponse(e)
    }
    return new ApiError({ kind: 'unknown', status: 0, cause: error })
  }

  private static withoutResponse(cause: unknown): ApiError {
    const name = cause instanceof Error ? cause.name : ''
    return new ApiError({ kind: name === 'TimeoutError' ? 'timeout' : name === 'AbortError' ? 'aborted' : 'network', status: 0, cause })
  }
}

/** Errors never shown: dropped on purpose, or handled by the sign-in redirect. */
export function isSilentError(error: ApiError): boolean {
  return error.kind === 'aborted' || error.kind === 'unauthorized'
}

type Translate = (key: string, params?: Record<string, unknown>) => string
type HasKey = (key: string) => boolean

/**
 * The text to show for an error, in the user's language: the app's own text for the error's `code`
 * (`errors.code.VERSION_CONFLICT`), else the server's message (user-facing 4xx, English), else the
 * text for its kind (`errors.kind.network`). The `code` never changes with the language (D9).
 */
export function errorText(error: unknown, t: Translate, te: HasKey): string {
  const apiError = ApiError.from(error)
  if (apiError.code && te(`errors.code.${apiError.code}`)) return t(`errors.code.${apiError.code}`)
  return apiError.serverMessage ?? t(`errors.kind.${apiError.kind}`)
}
