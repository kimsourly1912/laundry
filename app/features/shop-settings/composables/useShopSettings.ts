import type { ShopSettings } from '#shared/contracts/shop-settings'

/** The shop's details (`GET /api/shop/settings`): what New order and Paper slips draw on the slip. Read only (D44). */
export function useShopSettings() {
  return useApiQuery('shop-settings:settings', () => apiFetch<ShopSettings>('/shop/settings'))
}
