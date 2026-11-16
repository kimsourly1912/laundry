import type { AsyncDataOptions } from '#app'
import { ApiError } from '~/utils/api-error'
import { registerQuery } from '~/utils/invalidate'

/**
 * `useAsyncData` for API reads (docs/reference/api-client.md). `error` is an `ApiError`; `loading`
 * is the first load (show a skeleton), `refreshing` a reload behind data already shown.
 *
 * Keys are `<feature>:<name>` (`platform:shops`), so `invalidate('platform')` refreshes them.
 * `watch` sources refresh with **cancel**: a newer search never waits for, or is replaced by, an
 * older response.
 *
 * @example
 * const { data, loading, error, refresh } = useApiQuery('platform:shop', () => apiFetch<PlatformShop>(`/platform/shops/${id}`))
 */
export function useApiQuery<T>(key: MaybeRefOrGetter<string>, handler: () => Promise<T>, options: AsyncDataOptions<T> = {}) {
  const { watch: sources, ...asyncOptions } = options
  const asyncData = useAsyncData(key, handler, { dedupe: 'defer', ...asyncOptions })
  const { data, status, error: rawError } = asyncData
  const refresh = () => asyncData.refresh({ dedupe: 'cancel' })
  if (sources) watch(sources, () => refresh())
  if (import.meta.client) {
    const unregister = registerQuery({ key: () => toValue(key), refresh })
    if (getCurrentScope()) onScopeDispose(unregister)
  }
  const pending = computed(() => status.value === 'pending')
  return {
    data,
    refresh,
    pending,
    loading: computed(() => pending.value && data.value == null),
    refreshing: computed(() => pending.value && data.value != null),
    error: computed(() => (rawError.value ? ApiError.from(rawError.value) : undefined)),
  }
}
