import type { ElementOf, SlipData, SlipDesign, SlipElement, SlipShop } from '#shared/contracts/slip-design'
import { PAID_KEY } from '#shared/contracts/slip-design'
import { formatPhone } from '#shared/contracts/phone'
import { formatMoney } from '#shared/format'

/**
 * What a slip's fields mean (plan §5.3): which elements the owner fills, in which order, and the
 * text each value is drawn as. Shared by the studio, the owner's form (step 3), the server's check
 * of an order's values and the SVG builder.
 */

/** Fields the owner fills one by one (Order No. and the date are the server's). */
export const OWNER_FIELD_TYPES = ['number', 'textField', 'checkbox', 'phone', 'amount'] as const
export type OwnerFieldType = typeof OWNER_FIELD_TYPES[number]
export type OwnerField = ElementOf<OwnerFieldType>

/** Fixed-meaning fields: at most one of each per template (plan §5.3.3). */
export const FIXED_TYPES = ['orderNo', 'date', 'phone', 'amount'] as const

export function isOwnerField(element: SlipElement): element is OwnerField {
  return (OWNER_FIELD_TYPES as readonly string[]).includes(element.type)
}

/**
 * The keys the owner fills, in the design's fill order (plan §5.3.4): its owner fields, its choice
 * groups, and `paid` when it has a Paid / Not paid spot. Keys in `fillOrder` that no longer exist
 * are skipped; fields missing from it go last, in layer order.
 */
export function fillOrderOf(design: SlipDesign): string[] {
  const keys = new Set<string>()
  for (const element of design.elements) {
    if (isOwnerField(element)) keys.add(element.id)
    else if (element.type === 'option') keys.add(element.group)
    else if (element.type === 'paid') keys.add(PAID_KEY)
  }
  const ordered = design.fillOrder.filter(key => keys.has(key))
  const seen = new Set(ordered)
  return [...new Set([...ordered, ...[...keys].filter(key => !seen.has(key))])]
}

/** `2.5` with at most `decimals` places, no trailing zeros, Latin digits (i18n.md → Digits). */
export function formatNumber(value: number, decimals: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: decimals, useGrouping: false }).format(value)
}

/** `17/11/2026` from the shop's day `2026-11-17` (plan §5.3.3). */
export function formatSlipDate(date: string): string {
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year}`
}

/** The text a value-drawing element shows, or `''` when it has none. */
export function valueText(element: SlipElement, data: SlipData): string {
  const { values, order, shop } = data
  switch (element.type) {
    case 'number': {
      const value = values[element.id]
      if (typeof value !== 'number') return ''
      const text = formatNumber(value, element.decimals)
      return element.unit ? `${text} ${element.unit}` : text
    }
    case 'textField': {
      const value = values[element.id]
      return typeof value === 'string' ? value : ''
    }
    case 'orderNo':
      return order.number === null ? '' : String(order.number)
    case 'date':
      return order.date === null ? '' : formatSlipDate(order.date)
    case 'phone':
      return order.phone === null ? '' : formatPhone(order.phone)
    case 'amount':
      return order.amount === null ? '' : formatMoney(order.amount, shop.currency, shop.language)
    default:
      return ''
  }
}

/** Whether a checkbox, option or paid spot shows its mark. */
export function isMarked(element: SlipElement, data: SlipData): boolean {
  if (element.type === 'checkbox') return data.values[element.id] === true
  if (element.type === 'option') return data.values[element.group] === element.id
  if (element.type === 'paid') return data.order.paid !== null && data.order.paid === (element.value === 'paid')
  return false
}

/** A sample shop for the studio and Try it: its currency and language draw the amount. */
export const SAMPLE_SHOP: SlipShop = {
  name: 'ហាងបោកអ៊ុត Sample Laundry',
  phone: '012 345 678',
  address: 'Street 271, Phnom Penh',
  logoImageId: null,
  currency: 'KHR',
  language: 'km',
}

/**
 * Made-up values for every field, for the studio's Preview: each number field shows a value in its
 * range, each text field a word, each checkbox and choice group is marked, and the order is paid.
 */
export function sampleData(design: SlipDesign, options: { shop?: SlipShop, date: string }): SlipData {
  const { shop = SAMPLE_SHOP, date } = options
  const values: SlipData['values'] = {}
  for (const element of design.elements) {
    if (element.type === 'number') values[element.id] = Math.min(element.max, Math.max(element.min, 2))
    else if (element.type === 'textField') values[element.id] = 'Sample'.slice(0, element.maxLength)
    else if (element.type === 'checkbox') values[element.id] = true
    else if (element.type === 'option' && !(element.group in values)) values[element.group] = element.id
  }
  return { values, order: { number: 1024, date, phone: '+85512345678', amount: 12000, paid: true }, shop }
}
