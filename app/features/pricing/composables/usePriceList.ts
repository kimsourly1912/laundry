import type { InjectionKey } from 'vue'
import type { PriceItemList, PriceStatus, ServiceTypeList } from '#shared/contracts/pricing'
import type { PlatformShop } from '#shared/contracts/platform-shops'
import type { Currency } from '#shared/contracts/shop-settings'
import type { ApiError } from '~/utils/api-error'
import { useShopSettings } from '~/features/shop-settings'

/**
 * Whose price list the pricing pages show (D26): the signed-in shop's own (read only for its owner),
 * or a shop the platform keeps, named in the platform's path. The pages are the same; the scope
 * says where they read and write, where their links go, and in which currency.
 */
export interface PriceScope {
  /** API base: `/shop`, or `/platform/shops/<id>`. */
  api: string
  /** Page base: `/prices`, or `/platform/shops/<id>/prices`. */
  pages: string
  /** Part of each query key, so two shops' lists never share a cache entry. */
  key: string
  /** The page the list goes back to (the platform's shop page); none: the shop's own menu. */
  back?: string
  currency: ComputedRef<Currency | undefined>
  loading: ComputedRef<boolean>
  error: ComputedRef<ApiError | undefined>
  refresh: () => void
}

const scopeKey: InjectionKey<PriceScope> = Symbol('price-scope')

/** The signed-in shop's own list (the default). */
function useOwnShopScope(): PriceScope {
  const settings = useShopSettings()
  return {
    api: '/shop',
    pages: '/prices',
    key: 'own',
    currency: computed(() => settings.data.value?.currency),
    loading: computed(() => settings.loading.value),
    error: computed(() => settings.error.value),
    refresh: () => void settings.refresh(),
  }
}

/** A shop the platform keeps (a page under `/platform/shops/<id>/prices` provides it). */
export function providePlatformPriceScope(shopId: string): PriceScope {
  const shop = useApiQuery(() => `platform:shops:one:${shopId}`, () => apiFetch<PlatformShop>(`/platform/shops/${shopId}`))
  const scope: PriceScope = {
    api: `/platform/shops/${shopId}`,
    pages: `/platform/shops/${shopId}/prices`,
    key: shopId,
    back: `/platform/shops/${shopId}`,
    currency: computed(() => shop.data.value?.currency),
    loading: computed(() => shop.loading.value),
    error: computed(() => shop.error.value),
    refresh: () => void shop.refresh(),
  }
  provide(scopeKey, scope)
  return scope
}

/** The scope a page provided, else the signed-in shop's own. */
export function usePriceScope(): PriceScope {
  return inject(scopeKey, null) ?? useOwnShopScope()
}

/** The scope's service types in one status (a whole list: no pages, D22). */
export function useServiceTypes(status: MaybeRefOrGetter<PriceStatus> = 'active') {
  const scope = usePriceScope()
  return useApiQuery(() => `pricing:service-types:${scope.key}:${toValue(status)}`, () => apiFetch<ServiceTypeList>(`${scope.api}/service-types`, { query: { status: toValue(status) } }))
}

/** The scope's price items in one status. Prices are in the scope's currency. */
export function usePriceItems(status: MaybeRefOrGetter<PriceStatus> = 'active') {
  const scope = usePriceScope()
  return useApiQuery(() => `pricing:price-items:${scope.key}:${toValue(status)}`, () => apiFetch<PriceItemList>(`${scope.api}/price-items`, { query: { status: toValue(status) } }))
}
