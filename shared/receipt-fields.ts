import type { ReceiptField, ReceiptTextSource } from './contracts/receipts'

/**
 * How a receipt's fields read an order (D28), for the two places that draw them: the server's PNG
 * (server/features/receipts/receipts.render.ts) and the platform's designer. Values arrive
 * formatted (money, dates, the shop's language); these helpers only pick and place them.
 */

/** The only font the server has: Khmer and Latin in one family. The app loads the same one. */
export const RECEIPT_FONT = 'Noto Sans Khmer'

/** An order's values for the fields, formatted for display. */
export interface ReceiptValues {
  text: Record<ReceiptTextSource, string>
  /** By price item id: `3`, `2.5 kg`. Items the order doesn't have are absent. */
  quantities: Record<string, string>
  paid: boolean
  /** Service type ids the order has at least one item in. */
  services: readonly string[]
}

export type ReceiptTextField = Extract<ReceiptField, { kind: 'text' | 'quantity' }>
export type ReceiptCheckField = Extract<ReceiptField, { kind: 'check' | 'serviceCheck' }>

export function isTextField(field: ReceiptField): field is ReceiptTextField {
  return field.kind === 'text' || field.kind === 'quantity'
}

/** What a text field shows for these values; `''` when the order has nothing for it. */
export function fieldText(field: ReceiptTextField, values: ReceiptValues): string {
  return field.kind === 'text' ? values.text[field.source] : values.quantities[field.priceItemId] ?? ''
}

/** Whether a check field shows its tick for these values. */
export function isChecked(field: ReceiptCheckField, values: ReceiptValues): boolean {
  if (field.kind === 'check') return field.when === 'paid' ? values.paid : !values.paid
  return values.services.includes(field.serviceTypeId)
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * A tick as a path in a `size` square at (`x`, `y`). Drawn, not typed: the font has no ✓, and a
 * shape looks the same everywhere.
 */
export function checkMarkPath(x: number, y: number, size: number): string {
  const at = (fx: number, fy: number) => `${round(x + fx * size)} ${round(y + fy * size)}`
  return `M ${at(0.12, 0.55)} L ${at(0.4, 0.82)} L ${at(0.9, 0.18)}`
}

/** The stroke width of a tick of `size`. */
export function checkMarkWidth(size: number): number {
  return round(Math.max(2, size * 0.14))
}

/** The gap between two words, as a share of the font size (the font's own space is 0.26 em). */
export const WORD_GAP = 0.28
