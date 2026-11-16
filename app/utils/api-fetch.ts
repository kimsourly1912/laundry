import type { $Fetch, FetchOptions } from 'ofetch'
import { ApiError } from './api-error'

export type ApiFetchOptions = Omit<FetchOptions<'json'>, 'retry' | 'baseURL'>
export type ApiFetch = <T>(path: string, options?: ApiFetchOptions) => Promise<T>

interface CreateApiFetchOptions {
  /** ofetch with `baseURL: '/api'` and a timeout. */
  baseFetch: $Fetch
  /** A response said the session is over (401). Idempotent. */
  onSessionLost: () => void
  /** A response said the temporary password must be changed first (403 `PASSWORD_CHANGE_REQUIRED`). */
  onPasswordChangeRequired: () => void
  /**
   * The session's generation: it changes on sign-in, sign-out and session loss. A response to a
   * request started in another generation is dropped (`aborted`), so it can never show or change
   * another person's data.
   */
  sessionGeneration: () => number
}

/**
 * Our API client (docs/reference/api-client.md): every failure is an `ApiError`; **no retries**
 * (a retried write could apply twice); a 401 ends the session in the app; responses from an earlier
 * session are dropped.
 */
export function createApiFetch(options: CreateApiFetchOptions): ApiFetch {
  const { baseFetch, onSessionLost, onPasswordChangeRequired, sessionGeneration } = options
  return async function apiFetch<T>(path: string, fetchOptions?: ApiFetchOptions): Promise<T> {
    const generation = sessionGeneration()
    const dropped = () => new ApiError({ kind: 'aborted', status: 0 })
    let data: T
    try {
      data = await baseFetch<T>(path, { ...fetchOptions, retry: 0 } as FetchOptions<'json'>)
    }
    catch (error) {
      if (sessionGeneration() !== generation) throw dropped()
      const apiError = ApiError.from(error)
      if (apiError.kind === 'unauthorized') onSessionLost()
      else if (apiError.code === 'PASSWORD_CHANGE_REQUIRED') onPasswordChangeRequired()
      throw apiError
    }
    if (sessionGeneration() !== generation) throw dropped()
    return data
  }
}
