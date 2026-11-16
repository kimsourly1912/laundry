import type { LocationQuery } from 'vue-router'

/** Filter values a list keeps in the URL: text or a choice; `''` is "none". */
type Filters = Record<string, string>

function readFilters<T extends Filters>(query: LocationQuery, defaults: T): T {
  const filters = { ...defaults }
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    const value = query[key]
    if (typeof value === 'string') filters[key] = value as T[typeof key]
  }
  return filters
}

function readPage(query: LocationQuery): number {
  const page = Number(query.page)
  return Number.isInteger(page) && page >= 1 ? page : 1
}

/**
 * A list's filters and page, kept in the URL (`?status=suspended&search=wash&page=2`), so reload,
 * Back and shared links keep the place (page-patterns → Resource index). Changing a filter goes back
 * to page 1. Defaults are left out of the URL. `query` is what the API takes (`''` dropped).
 *
 * @example
 * const { filters, page, query } = usePaginatedQuery({ status: '', search: '' })
 * const { data } = useApiQuery('platform:shops', () => apiFetch<Page<PlatformShop>>('/platform/shops', { query: query.value }), { watch: [query] })
 */
export function usePaginatedQuery<T extends Filters>(defaults: T, pageSize = 20) {
  const route = useRoute()
  const router = useRouter()
  const filters = reactive(readFilters(route.query, defaults)) as T
  const page = ref(readPage(route.query))

  // The URL is the source when it changes (Back, a menu link to the bare list).
  watch(() => route.query, (query) => {
    Object.assign(filters, readFilters(query, defaults))
    page.value = readPage(query)
  })

  // A filter the user changed (not one read from the URL): back to page 1.
  watch(() => ({ ...filters }), (next) => {
    const fromUrl = readFilters(route.query, defaults)
    if (Object.keys(next).every(key => next[key] === fromUrl[key])) return
    page.value = 1
  })
  // Written to the URL without a new history entry.
  watch([() => ({ ...filters }), page], () => {
    const query: Record<string, string> = {}
    for (const [key, value] of Object.entries(filters)) if (value !== defaults[key]) query[key] = value
    if (page.value > 1) query.page = String(page.value)
    router.replace({ query })
  })

  const query = computed(() => {
    const api: Record<string, string | number> = { page: page.value, pageSize }
    for (const [key, value] of Object.entries(filters)) if (value) api[key] = value
    return api
  })

  return { filters, page, pageSize, query }
}
