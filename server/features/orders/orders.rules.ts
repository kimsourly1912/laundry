import type { OrderStatus } from '#shared/contracts/orders'
import { toE164 } from '#shared/contracts/phone'

/**
 * The orders feature's pure rules (architecture → Inside a feature): what a search means, and which
 * actions an order allows in its state (plan §4: `open` → `picked_up` or `cancelled`; paid is apart).
 */

/** What the Orders search box asks for: an exact phone, an exact number, or nothing that can match. */
export type OrderSearch = { phone: string } | { number: number } | { none: true }

/** `012 345 678` and `+855 12 345 678` are a phone; `12` and `#12` an order number; anything else matches nothing. */
export function parseOrderSearch(text: string): OrderSearch {
  const phone = toE164(text)
  if (phone) return { phone }
  const number = text.replace(/^#/, '').trim()
  if (/^\d{1,9}$/.test(number) && Number(number) >= 1) return { number: Number(number) }
  return { none: true }
}

export type OrderAction = 'pay' | 'pick-up' | 'cancel'

/**
 * Whether the order allows the action (plan §4): paid is separate from the state, so an order may
 * be paid while open or after an unpaid pickup, never once cancelled or twice; pickup and cancel
 * only while open. Pickup of an unpaid order is allowed (the app asks first; the audit row says it).
 */
export function canDo(action: OrderAction, order: { status: OrderStatus, paid: boolean }): boolean {
  switch (action) {
    case 'pay': return !order.paid && order.status !== 'cancelled'
    case 'pick-up':
    case 'cancel': return order.status === 'open'
  }
}
