import type { LinePriceItem } from '#server/features/pricing'
import type { UpdateLineInput } from '#shared/contracts/orders'
import { lineTotal, MAX_PIECES } from '#shared/contracts/orders'
import type { PriceUnit } from '#shared/contracts/pricing'

/**
 * The order rules that aren't the state machine (spec §7; the machine itself is shared with the app:
 * `ORDER_TRANSITIONS` in shared/contracts/orders.ts). Pure: no database, no clock.
 */

export { canRecordPayment, canTransition, isEditable, lineTotal, orderTotal } from '#shared/contracts/orders'

/** A line's frozen copy of its price item (spec §16): names, unit and price as they are now. */
export interface LineSnapshot {
  priceItemId: string | null
  serviceNameEn: string
  serviceNameKm: string | null
  itemNameEn: string
  itemNameKm: string | null
  unit: PriceUnit
  quantity: number
  unitPrice: number
  lineTotal: number
}

export function snapshotLine(item: LinePriceItem, quantity: number): LineSnapshot {
  return {
    priceItemId: item.id,
    serviceNameEn: item.serviceNameEn,
    serviceNameKm: item.serviceNameKm,
    itemNameEn: item.nameEn,
    itemNameKm: item.nameKm,
    unit: item.unit,
    quantity,
    unitPrice: item.price,
    lineTotal: lineTotal(item.unit, quantity, item.price),
  }
}

/** The same line with another quantity: its names and price stay as they were. */
export function requantify(line: LineSnapshot, quantity: number): LineSnapshot {
  return { ...line, quantity, lineTotal: lineTotal(line.unit, quantity, line.unitPrice) }
}

/** The quantity's own limit: the contract allows grams up to 1,000 kg; pieces stop at `MAX_PIECES`. */
export function quantityError(unit: PriceUnit, quantity: number): string | undefined {
  return unit === 'piece' && quantity > MAX_PIECES ? `At most ${MAX_PIECES} pieces` : undefined
}

/**
 * Whether an edit keeps exactly the order's lines: the same lines, in the same order, with the same
 * quantities, and none added. A paid order may change its note only (D24).
 */
export function keepsLines(before: readonly { id: string, quantity: number }[], after: readonly UpdateLineInput[]): boolean {
  return before.length === after.length
    && after.every((line, index) => 'lineId' in line && line.lineId === before[index]!.id && line.quantity === before[index]!.quantity)
}
