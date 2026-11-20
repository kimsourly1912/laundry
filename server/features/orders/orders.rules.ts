/** What the Orders search box asks for: an exact phone, an exact number, or nothing that can match. */
export type OrderSearch = { phone: string } | { number: number } | { none: true }

/** `012 345 678` and `+855 12 345 678` are a phone; `12` and `#12` an order number; anything else matches nothing. */
export function parseOrderSearch(text: string): OrderSearch {
  const typed = text.trim()
  const number = typed.replace(/^#/, '')
  if (/^\d{1,9}$/.test(number) && Number(number) >= 1 && (typed.startsWith('#') || !typed.startsWith('0'))) return { number: Number(number) }
  return typed ? { phone: typed } : { none: true }
}
