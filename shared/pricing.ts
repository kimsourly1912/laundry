import type { PriceUnit } from './contracts/prices'

/**
 * Pricing an itemized order (D39; product notes → How a counter order is saved): the server
 * charges with it, and New order shows the same running total. Pure; tested in
 * server/features/orders/tests/orders.rules.test.ts.
 */

export interface PricedValue {
  /** The slip field (a number element with a `priceKey`). */
  fieldId: string
  key: string
  /** The count, or the weight in kg. */
  value: number
}

export interface PriceForLine {
  id: string
  label: string
  unit: PriceUnit
  /** Minor units per piece or per kg. */
  price: number
}

export interface OrderLine {
  fieldId: string
  priceItemId: string
  key: string
  label: string
  unit: PriceUnit
  /** Pieces, or grams for `kg`. */
  quantity: number
  unitPrice: number
  lineTotal: number
}

export type LineProblem = 'noPrice' | 'wholePieces'

/**
 * Prices an order's lines (product notes → How a counter order is saved): a piece count times the
 * price per piece; a weight in kg to whole grams, times the price per kg, rounded to the nearest
 * minor unit, halves up. Empty and zero values make no line. A key the shop has no active price for,
 * or a part of a piece, is a problem on its field.
 */
export function priceLines(values: readonly PricedValue[], prices: ReadonlyMap<string, PriceForLine>): { lines: OrderLine[], total: number, problems: Record<string, LineProblem> } {
  const lines: OrderLine[] = []
  const problems: Record<string, LineProblem> = {}
  for (const { fieldId, key, value } of values) {
    if (!(value > 0)) continue
    const item = prices.get(key)
    if (!item) {
      problems[fieldId] = 'noPrice'
      continue
    }
    if (item.unit === 'piece' && !Number.isInteger(value)) {
      problems[fieldId] = 'wholePieces'
      continue
    }
    const quantity = item.unit === 'kg' ? Math.round(value * 1000) : value
    const lineTotal = item.unit === 'kg' ? Math.floor((quantity * item.price + 500) / 1000) : quantity * item.price
    lines.push({ fieldId, priceItemId: item.id, key, label: item.label, unit: item.unit, quantity, unitPrice: item.price, lineTotal })
  }
  return { lines, total: lines.reduce((sum, line) => sum + line.lineTotal, 0), problems }
}
