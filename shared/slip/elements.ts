import type { ChoiceGroup, ElementOf, ElementType } from '#shared/contracts/slip-design'

/**
 * New fields with the studio's defaults (plan §5.3): what the Fields panel adds. Ids are made by
 * the caller (`newKey`), so tests can name them.
 */

const INK = '#111827'
const MARK = '#047857'

/** A short random key for a new element or group (`keySchema`). */
export function newKey(): string {
  return Math.random().toString(36).slice(2, 10)
}

interface Placement {
  id: string
  x?: number
  y?: number
  w?: number
  h?: number
}

/** Where each type starts, before the studio centres it in the view. */
const DEFAULT_SIZES: Record<ElementType, { w: number, h: number }> = {
  number: { w: 80, h: 44 },
  textField: { w: 240, h: 44 },
  checkbox: { w: 40, h: 40 },
  option: { w: 40, h: 40 },
  orderNo: { w: 140, h: 44 },
  date: { w: 160, h: 44 },
  phone: { w: 200, h: 44 },
  amount: { w: 180, h: 44 },
  paid: { w: 40, h: 40 },
}

function baseOf(type: ElementType, placement: Placement) {
  const size = DEFAULT_SIZES[type]
  const { id, x = 0, y = 0, w = size.w, h = size.h } = placement
  return { id, x, y, w, h }
}

const valueStyle = { size: 28, bold: false, color: INK, align: 'center' as const }

type Extra<T extends ElementType> = Partial<Omit<ElementOf<T>, 'type'>>

/**
 * An element of `type` with the studio's defaults, overridden by `extra`. A text field's defaults
 * follow plan §5.3.2 (0–999, 40 characters); labels start empty, except the fixed-meaning fields'.
 */
export function createElement<T extends ElementType>(type: T, placement: Placement, extra: Extra<T> = {}): ElementOf<T> {
  const base = baseOf(type, placement)
  const defaults: { [K in ElementType]: Omit<ElementOf<K>, keyof typeof base> } = {
    number: { type: 'number', label: '', required: false, ...valueStyle, border: false, decimals: 0, min: 0, max: 999, unit: '' },
    textField: { type: 'textField', label: '', required: false, ...valueStyle, align: 'left', border: false, maxLength: 40 },
    checkbox: { type: 'checkbox', label: '', required: false, border: false, mark: 'tick', color: MARK },
    option: { type: 'option', group: '', label: '', border: false, color: MARK },
    orderNo: { type: 'orderNo', ...valueStyle, border: false },
    date: { type: 'date', ...valueStyle, border: false },
    phone: { type: 'phone', label: 'Phone', required: false, ...valueStyle, border: false },
    amount: { type: 'amount', label: 'Amount', required: false, ...valueStyle, border: false },
    paid: { type: 'paid', value: 'paid', label: 'Paid', border: false, mark: 'tick', color: MARK },
  }
  // One object per type above, so the result is the element of `type`: TypeScript can't follow
  // the generic through the lookup.
  return { ...base, ...defaults[type], ...extra } as unknown as ElementOf<T>
}

/** A new choice group (plan §5.3.2); its options are added with `createElement('option', …, { group })`. */
export function createGroup(id: string, extra: Partial<ChoiceGroup> = {}): ChoiceGroup {
  return { id, label: '', required: false, mark: 'tick', ...extra }
}

/** The labels of the Not paid spot, when the studio adds the pair (plan §5.3.3). */
export const UNPAID_LABEL = 'Not paid'
