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
