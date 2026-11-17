import type { ChoiceGroup, ElementOf, ElementType } from '#shared/contracts/slip-design'

/**
 * New elements with the studio's defaults (plan §5.3–5.4): what the Form, Text, Elements and Shop
 * info tabs add. Ids are made by the caller (`newKey`), so tests can name them.
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
  name?: string
}

const DEFAULT_NAMES: Record<ElementType, string> = {
  text: 'Text',
  rect: 'Rectangle',
  ellipse: 'Circle',
  triangle: 'Triangle',
  line: 'Line',
  icon: 'Icon',
  image: 'Image',
  shopInfo: 'Shop info',
  number: 'Number',
  textField: 'Text field',
  checkbox: 'Checkbox',
  option: 'Option',
  orderNo: 'Order No.',
  date: 'Date',
  phone: 'Phone',
  amount: 'Amount',
  paid: 'Paid',
}

/** Where each type starts, before the studio centres it in the view. */
const DEFAULT_SIZES: Record<ElementType, { w: number, h: number }> = {
  text: { w: 300, h: 40 },
  rect: { w: 200, h: 120 },
  ellipse: { w: 120, h: 120 },
  triangle: { w: 120, h: 110 },
  line: { w: 240, h: 12 },
  icon: { w: 60, h: 60 },
  image: { w: 200, h: 200 },
  shopInfo: { w: 320, h: 44 },
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
  const { id, x = 0, y = 0, w = size.w, h = size.h, name = DEFAULT_NAMES[type] } = placement
  return { id, name, x, y, w, h, rotation: 0, opacity: 1, locked: false, hidden: false }
}

const valueStyle = { size: 28, bold: false, color: INK, align: 'center' as const }
const label = (en: string, km: string) => ({ en, km })

type Extra<T extends ElementType> = Partial<Omit<ElementOf<T>, 'type'>>

/**
 * An element of `type` with the studio's defaults, overridden by `extra`. A text field's defaults
 * follow plan §5.4.2 (0–999, 40 characters); labels start empty, except the fixed-meaning fields'.
 */
export function createElement<T extends ElementType>(type: T, placement: Placement, extra: Extra<T> = {}): ElementOf<T> {
  const base = baseOf(type, placement)
  const defaults: { [K in ElementType]: Omit<ElementOf<K>, keyof typeof base> } = {
    text: { type: 'text', text: 'Text', size: 28, bold: false, color: INK, align: 'left', lineHeight: 1.4 },
    rect: { type: 'rect', fill: '#e5e7eb', stroke: null, strokeWidth: 2, dashed: false, radius: 0 },
    ellipse: { type: 'ellipse', fill: '#e5e7eb', stroke: null, strokeWidth: 2, dashed: false },
    triangle: { type: 'triangle', fill: '#e5e7eb', stroke: null, strokeWidth: 2, dashed: false },
    line: { type: 'line', color: INK, strokeWidth: 2, dashed: false },
    icon: { type: 'icon', icon: 'tick', color: INK },
    image: { type: 'image', imageId: '00000000-0000-7000-8000-000000000000' },
    shopInfo: { type: 'shopInfo', info: 'name', ...valueStyle, align: 'left' },
    number: { type: 'number', label: label('', ''), required: false, ...valueStyle, border: false, decimals: 0, min: 0, max: 999, unit: '' },
    textField: { type: 'textField', label: label('', ''), required: false, ...valueStyle, align: 'left', border: false, maxLength: 40 },
    checkbox: { type: 'checkbox', label: label('', ''), required: false, border: false, mark: 'tick', color: MARK },
    option: { type: 'option', group: '', label: label('', ''), border: false, color: MARK },
    orderNo: { type: 'orderNo', ...valueStyle, border: false },
    date: { type: 'date', ...valueStyle, border: false },
    phone: { type: 'phone', label: label('Phone', 'លេខទូរស័ព្ទ'), required: false, ...valueStyle, border: false },
    amount: { type: 'amount', label: label('Amount', 'តម្លៃ'), required: false, ...valueStyle, border: false },
    paid: { type: 'paid', value: 'paid', label: label('Paid', 'បានបង់'), border: false, mark: 'tick', color: MARK },
  }
  // One object per type above, so the result is the element of `type`: TypeScript can't follow
  // the generic through the lookup.
  return { ...base, ...defaults[type], ...extra } as unknown as ElementOf<T>
}

/** A new choice group (plan §5.4.2); its options are added with `createElement('option', …, { group })`. */
export function createGroup(id: string, extra: Partial<ChoiceGroup> = {}): ChoiceGroup {
  return { id, label: label('', ''), required: false, mark: 'tick', ...extra }
}

/** The labels of the Not paid spot, when the studio adds the pair (plan §5.4.3). */
export const UNPAID_LABEL = label('Not paid', 'មិនទាន់បង់')
