import type { OrderTemplate } from '#shared/contracts/orders'

/** The paper slips the shop can fill a new order on (`GET /api/shop/templates`), each at its latest version. */
export function useOrderTemplates() {
  return useApiQuery('orders:templates', () => apiFetch<OrderTemplate[]>('/shop/templates'))
}
