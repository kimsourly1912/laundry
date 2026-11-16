import type { PriceItemList, PriceStatus, ServiceTypeList } from '#shared/contracts/pricing'

/** The shop's service types in one status (a whole list: no pages, D22). */
export function useServiceTypes(status: MaybeRefOrGetter<PriceStatus> = 'active') {
  return useApiQuery(() => `pricing:service-types:${toValue(status)}`, () => apiFetch<ServiceTypeList>('/shop/service-types', { query: { status: toValue(status) } }))
}

/** The shop's price items in one status. Prices are in the shop's currency. */
export function usePriceItems(status: MaybeRefOrGetter<PriceStatus> = 'active') {
  return useApiQuery(() => `pricing:price-items:${toValue(status)}`, () => apiFetch<PriceItemList>('/shop/price-items', { query: { status: toValue(status) } }))
}
