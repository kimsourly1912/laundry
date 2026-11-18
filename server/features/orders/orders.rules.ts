import type { OrderStage, OrderStatus } from '#shared/contracts/orders'
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

export type OrderAction = 'start' | 'ready' | 'rework' | 'pay' | 'pick-up' | 'cancel'

/**
 * Whether the order allows the action (D39, product notes → order lifecycle):
 *
 * | From | Allowed |
 * |---|---|
 * | Received | start work, mark ready directly, cancel |
 * | In progress | mark ready, cancel |
 * | Ready | collect, back to In progress (rework), cancel |
 * | Collected, Cancelled | nothing but payment for an unpaid collected order |
 *
 * Paid is apart from the work: paid while open or after an unpaid pickup, never once cancelled or
 * twice. An unpaid pickup is allowed (the app asks first; the audit row says it).
 */
export function canDo(action: OrderAction, order: { status: OrderStatus, stage: OrderStage, paid: boolean }): boolean {
  const open = order.status === 'open'
  switch (action) {
    case 'start': return open && order.stage === 'received'
    case 'ready': return open && order.stage !== 'ready'
    case 'rework': return open && order.stage === 'ready'
    case 'pick-up': return open && order.stage === 'ready'
    case 'cancel': return open
    case 'pay': return !order.paid && order.status !== 'cancelled'
  }
}
