import type { OrderState } from '#shared/contracts/orders'

export { orderState } from '#shared/contracts/orders'

/**
 * How an order's state reads on screen (D39; implementation guide → interaction contract):
 * Received, In progress, Ready, Collected, Cancelled. Work and payment are two badges, never one.
 */
export const ORDER_STATE_BADGE: Record<OrderState, { key: string, color: 'info' | 'warning' | 'success' | 'neutral' | 'primary' }> = {
  received: { key: 'orders.state.received', color: 'info' },
  in_progress: { key: 'orders.state.in_progress', color: 'warning' },
  ready: { key: 'orders.state.ready', color: 'success' },
  picked_up: { key: 'orders.state.picked_up', color: 'neutral' },
  cancelled: { key: 'orders.state.cancelled', color: 'neutral' },
}
