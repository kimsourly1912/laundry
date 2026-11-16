import type { OrderLine, UpdateLineInput } from '#shared/contracts/orders'
import { lineTotal, MAX_GRAMS, MAX_PIECES } from '#shared/contracts/orders'
import type { PriceItem, PriceUnit, ServiceType } from '#shared/contracts/pricing'
import { formatQuantity } from '#shared/format'

// Shared with the server's receipts.
export { formatQuantity }

/**
 * An order's lines while they're edited (the new-order flow and the edit page): what the person
 * typed, beside the snapshot it was priced from. The server prices and totals again on save
 * (page-patterns → Task flow: the server decides).
 */
export interface DraftLine {
  /** Stable in the list while editing. */
  key: string
  /** A line already on the order: kept with its own names and price. */
  lineId?: string
  /** A new line: priced from this item when saved. */
  priceItemId?: string
  serviceNameEn: string
  serviceNameKm: string | null
  itemNameEn: string
  itemNameKm: string | null
  unit: PriceUnit
  unitPrice: number
  /** As typed: pieces (`3`) or kilograms (`2.5`). */
  quantity: string
}

let nextKey = 0
const newKey = () => `line-${++nextKey}`

export function draftFromPriceItem(item: PriceItem, type: Pick<ServiceType, 'nameEn' | 'nameKm'>): DraftLine {
  return {
    key: newKey(),
    priceItemId: item.id,
    serviceNameEn: type.nameEn,
    serviceNameKm: type.nameKm,
    itemNameEn: item.nameEn,
    itemNameKm: item.nameKm,
    unit: item.unit,
    unitPrice: item.price,
    quantity: item.unit === 'piece' ? '1' : '',
  }
}

export function draftFromLine(line: OrderLine): DraftLine {
  return {
    key: newKey(),
    lineId: line.id,
    serviceNameEn: line.serviceNameEn,
    serviceNameKm: line.serviceNameKm,
    itemNameEn: line.itemNameEn,
    itemNameKm: line.itemNameKm,
    unit: line.unit,
    unitPrice: line.unitPrice,
    quantity: formatQuantity(line.unit, line.quantity),
  }
}

/** Pieces, or grams from kilograms with at most 3 decimals (`2.5` → 2500). `null` if it isn't one, or is 0. */
export function parseQuantity(unit: PriceUnit, text: string): number | null {
  const plain = text.trim().replace(',', '.')
  if (unit === 'piece') return /^\d{1,4}$/.test(plain) && Number(plain) >= 1 && Number(plain) <= MAX_PIECES ? Number(plain) : null
  const match = /^(\d{1,4})(?:\.(\d{1,3}))?$/.exec(plain)
  if (!match) return null
  const grams = Number(match[1]) * 1000 + Number((match[2] ?? '').padEnd(3, '0'))
  return grams >= 1 && grams <= MAX_GRAMS ? grams : null
}

/** The line's total as the server will compute it, or `null` while the quantity isn't valid. */
export function draftTotal(line: DraftLine): number | null {
  const quantity = parseQuantity(line.unit, line.quantity)
  return quantity === null ? null : lineTotal(line.unit, quantity, line.unitPrice)
}

/** The preview total of the lines that are valid. */
export function previewTotal(lines: readonly DraftLine[]): number {
  return lines.reduce((sum, line) => sum + (draftTotal(line) ?? 0), 0)
}

/** Field errors for `UForm` (`lines.2.quantity`), and one for no lines at all. */
export function lineErrors(lines: readonly DraftLine[], t: (key: string) => string): { name: string, message: string }[] {
  if (!lines.length) return [{ name: 'lines', message: t('orders.lines.required') }]
  return lines.flatMap((line, index) => (parseQuantity(line.unit, line.quantity) === null
    ? [{ name: `lines.${index}.quantity`, message: t(line.unit === 'piece' ? 'orders.lines.invalidPieces' : 'orders.lines.invalidKg') }]
    : []))
}

/** For `POST /api/shop/orders`: new lines only. */
export function toCreateLines(lines: readonly DraftLine[]): { priceItemId: string, quantity: number }[] {
  return lines.map(line => ({ priceItemId: line.priceItemId!, quantity: parseQuantity(line.unit, line.quantity)! }))
}

/** For `PATCH /api/shop/orders/:id`: kept lines by id, new ones by price item. */
export function toUpdateLines(lines: readonly DraftLine[]): UpdateLineInput[] {
  return lines.map((line) => {
    const quantity = parseQuantity(line.unit, line.quantity)!
    return line.lineId ? { lineId: line.lineId, quantity } : { priceItemId: line.priceItemId!, quantity }
  })
}
