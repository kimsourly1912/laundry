import type { ApiFetch, ApiFetchOptions } from './api-fetch'

let client: ApiFetch | undefined

/** Set once by `plugins/api.client.ts`. */
export function configureApi(fetch: ApiFetch) {
  client = fetch
}

/**
 * Calls our API (`/api` + `path`). Resolves to the response body; throws `ApiError`. Request and
 * response types are in `shared/contracts/`.
 *
 * @example
 * const page = await apiFetch<Page<PlatformShop>>('/platform/shops', { query: { status: 'active' } })
 * await apiFetch<PlatformShop>(`/platform/shops/${id}/suspend`, { method: 'POST', body: { version } })
 */
export function apiFetch<T>(path: string, options?: ApiFetchOptions): Promise<T> {
  if (!client) throw new Error('apiFetch was called before plugins/api.client.ts configured it.')
  return client<T>(path, options)
}
