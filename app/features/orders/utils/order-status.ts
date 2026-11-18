import type { OrderStatus } from '#shared/contracts/orders'

/**
 * How an order's state reads on screen (implementation guide → interaction contract): `open` is
 * "Received", `picked_up` "Collected". Work and payment are two badges, never one.
 */
export const ORDER_STATUS_BADGE: Record<OrderStatus, { key: string, color: 'info' | 'success' | 'neutral' }> = {
  open: { key: 'orders.status.open', color: 'info' },
  picked_up: { key: 'orders.status.picked_up', color: 'success' },
  cancelled: { key: 'orders.status.cancelled', color: 'neutral' },
}
