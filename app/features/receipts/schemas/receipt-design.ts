import type { ReceiptField, ReceiptTextSource } from '#shared/contracts/receipts'
import { RECEIPT_TEXT_SOURCES } from '#shared/contracts/receipts'
import type { PriceItem, ServiceType } from '#shared/contracts/pricing'
import type { ReceiptValues } from '#shared/receipt-fields'

/**
 * The receipt designer's work (D28), without the screen: what can be placed, a new field's
 * defaults, what a field is called and what it shows while designing. The server checks every
 * field again (contract and references) on save.
 */

type Translate = (key: string, params?: Record<string, unknown>) => string
type Names = Pick<PriceItem, 'nameEn' | 'nameKm'>

/** Something the admin can add: one of the order's details, a tick, a price item's quantity. */
export type FieldChoice
  = | { kind: 'text', source: ReceiptTextSource }
    | { kind: 'check', when: 'paid' | 'unpaid' }
    | { kind: 'serviceCheck', serviceTypeId: string }
    | { kind: 'quantity', priceItemId: string }

interface Canvas {
  width: number
  height: number
}

/** A key no other field has. */
function newFieldId(fields: readonly ReceiptField[]): string {
  const taken = new Set(fields.map(field => field.id))
  let n = fields.length + 1
  while (taken.has(`f${n}`)) n++
  return `f${n}`
}

/**
 * A new field in the middle of the canvas, sized to it: text a 24th of the height (most slips are
 * about 20 lines tall), a tick a little bigger. Dark text; the admin changes it to suit the art.
 */
export function newField(choice: FieldChoice, canvas: Canvas, fields: readonly ReceiptField[]): ReceiptField {
  const textSize = Math.min(400, Math.max(12, Math.round(canvas.height / 24)))
  const place = { id: newFieldId(fields), x: Math.round(canvas.width / 2), y: Math.round(canvas.height / 2), color: '#111111' }
  if (choice.kind === 'check' || choice.kind === 'serviceCheck') return { ...place, ...choice, size: Math.round(textSize * 1.2) }
  return { ...place, ...choice, size: textSize, align: 'start', bold: false }
}

/** A position kept inside the canvas, in whole pixels. */
export function clampPoint(point: { x: number, y: number }, canvas: Canvas): { x: number, y: number } {
  const clamp = (value: number, max: number) => Math.min(max, Math.max(0, Math.round(value)))
  return { x: clamp(point.x, canvas.width), y: clamp(point.y, canvas.height) }
}

function localName(names: Names, locale: string): string {
  return locale === 'km' && names.nameKm ? names.nameKm : names.nameEn
}

interface PriceNames {
  items: readonly (Pick<PriceItem, 'id' | 'serviceTypeId'> & Names)[]
  types: readonly (Pick<ServiceType, 'id'> & Names)[]
}

/** What a field is called in the designer's list: "Customer", "Paid tick", "Shirt · Wash & iron". */
export function fieldLabel(field: ReceiptField | FieldChoice, names: PriceNames, t: Translate, locale: string): string {
  if (field.kind === 'text') return t(`receipts.sources.${field.source}`)
  if (field.kind === 'check') return t(field.when === 'paid' ? 'receipts.paidTick' : 'receipts.unpaidTick')
  if (field.kind === 'serviceCheck') {
    const type = names.types.find(entry => entry.id === field.serviceTypeId)
    return t('receipts.serviceTick', { service: type ? localName(type, locale) : t('receipts.removedEntry') })
  }
  const item = names.items.find(entry => entry.id === field.priceItemId)
  if (!item) return t('receipts.removedEntry')
  const type = names.types.find(entry => entry.id === item.serviceTypeId)
  return type ? `${localName(item, locale)} · ${localName(type, locale)}` : localName(item, locale)
}

/** Everything the admin can add for this price list, in list order: details, ticks, then quantities. */
export function fieldChoices(names: PriceNames): FieldChoice[] {
  return [
    ...RECEIPT_TEXT_SOURCES.map(source => ({ kind: 'text' as const, source })),
    { kind: 'check', when: 'paid' },
    { kind: 'check', when: 'unpaid' },
    ...names.types.map(type => ({ kind: 'serviceCheck' as const, serviceTypeId: type.id })),
    ...names.items.map(item => ({ kind: 'quantity' as const, priceItemId: item.id })),
  ]
}

/**
 * Made-up values while designing, like the server's preview: every box filled, paid. Only the
 * preview (the server's own PNG) shows the receipt's exact look.
 */
export function designValues(options: { shopName: string, total: string, date: string, fields: readonly ReceiptField[], t: Translate }): ReceiptValues {
  const { shopName, total, date, fields, t } = options
  return {
    text: {
      shopName,
      number: '61',
      date,
      customer: t('receipts.sample.customer'),
      phone: '012 345 678',
      total,
      payment: t('receipts.sample.paid'),
      note: t('receipts.sample.note'),
    },
    quantities: Object.fromEntries(fields.flatMap(field => (field.kind === 'quantity' ? [[field.priceItemId, '2']] : []))),
    paid: true,
    services: fields.flatMap(field => (field.kind === 'serviceCheck' ? [field.serviceTypeId] : [])),
  }
}
