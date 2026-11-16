import type { OrderStatus } from '#shared/contracts/orders'

/** A status's badge color: what needs the owner's attention stands out (ready, unpaid). */
export const STATUS_COLOR: Record<OrderStatus, 'neutral' | 'info' | 'success' | 'warning' | 'error'> = {
  received: 'neutral',
  in_progress: 'info',
  ready: 'success',
  collected: 'neutral',
  cancelled: 'error',
}
