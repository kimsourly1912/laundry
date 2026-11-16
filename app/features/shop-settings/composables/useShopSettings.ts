import type { ShopSettings } from '#shared/contracts/shop-settings'

/** The shop's settings (`GET /api/shop/settings`): the settings page, and the currency other screens show prices in. */
export function useShopSettings() {
  return useApiQuery('shop-settings:settings', () => apiFetch<ShopSettings>('/shop/settings'))
}
