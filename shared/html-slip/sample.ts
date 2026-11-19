import type { ElementOf, SlipData, SlipDesign, SlipLine, SlipShop, SlipValues } from '#shared/contracts/slip-design'
import type { CustomSample } from '#shared/contracts/templates'
import { sampleData, SAMPLE_SHOP } from '#shared/slip/fields'
import { checkFill } from '#shared/slip/values'

/**
 * The Studio's sample orders (D39; product notes → "preview blank, typical and crowded sample
 * orders"): blank shows the slip before anything is filled; typical, the usual values; crowded,
 * the longest text and the most lines, to see what overflows before publishing.
 */
export const SAMPLES = ['blank', 'typical', 'crowded'] as const
export type Sample = typeof SAMPLES[number]

const SAMPLE_QR = 'https://example.com/sample-laundry-slip'

function sampleLine(element: ElementOf<'number'>, value: number): SlipLine {
  const kg = element.unit === 'kg'
  return { label: element.label, unit: kg ? 'kg' : 'piece', quantity: kg ? Math.round(value * 1000) : value, lineTotal: Math.round(value * (kg ? 3000 : 2000)) }
}

export function customSampleFields(design: SlipDesign) {
  return design.elements.filter(field => field.type === 'number' || field.type === 'textField' || field.type === 'checkbox')
}

/** Use the slip's field limits, and allow incomplete samples so authors can see empty fields. */
export function customSampleFieldProblems(design: SlipDesign, values: SlipValues) {
  const ownValues = Object.assign<SlipValues, SlipValues>(Object.create(null), values)
  const problems = checkFill({ ...design, elements: customSampleFields(design), groups: [] }, { values: ownValues, phone: '', amount: null, paid: false })
  return Object.fromEntries(Object.entries(problems).filter(([, problem]) => problem.code !== 'required'))
}

export function customSampleOrder(design: SlipDesign, options: { custom: CustomSample, date: string }): SlipData {
  const { custom, date } = options
  const typical = sampleOrder(design, { sample: 'typical', date })
  const values: SlipValues = Object.fromEntries(design.groups.flatMap(({ id }) => {
    const value = typical.values[id]
    return typeof value === 'string' ? [[id, value]] : []
  }))
  const lines: SlipLine[] = []
  let priced = false
  for (const field of customSampleFields(design)) {
    const value = Object.hasOwn(custom.values, field.id) ? custom.values[field.id] : undefined
    if (value !== undefined) values[field.id] = value
    if (field.type === 'number' && field.priceKey) {
      priced = true
      if (typeof value === 'number' && value > 0) lines.push(sampleLine(field, value))
    }
  }
  const amount = custom.amount ?? (priced ? lines.reduce((total, line) => total + line.lineTotal, 0) : typical.order.amount)
  return { ...typical, values, order: { ...typical.order, customerName: custom.customerName, amount, lines } }
}

export function sampleOrder(design: SlipDesign, options: { sample: Sample, date: string, shop?: SlipShop }): SlipData {
  const { sample, date, shop = SAMPLE_SHOP } = options
  if (sample === 'blank') {
    return { values: {}, order: { number: null, date: null, phone: null, amount: null, paid: null, lines: [] }, shop }
  }
  const typical = sampleData(design, { shop, date })
  const priced = design.elements.filter((element): element is ElementOf<'number'> => element.type === 'number' && Boolean(element.priceKey))
  if (sample === 'typical') {
    const values = { ...typical.values }
    const lines = priced.map((element) => {
      const value = Math.max(element.min, Math.min(element.max, element.unit === 'kg' ? 2.5 : 2))
      values[element.id] = value
      return sampleLine(element, value)
    })
    // An itemized slip's total is its lines' (D39), as an order's is.
    const amount = lines.length ? lines.reduce((sum, line) => sum + line.lineTotal, 0) : typical.order.amount
    return { ...typical, values, order: { ...typical.order, amount, customerName: 'Dara', dueDate: date, lines, qrUrl: SAMPLE_QR } }
  }
  const values: SlipData['values'] = { ...typical.values }
  for (const element of design.elements) {
    if (element.type === 'number') values[element.id] = element.max
    if (element.type === 'textField') values[element.id] = 'ក'.repeat(Math.min(element.maxLength, 12)) + ' Long name'.slice(0, Math.max(0, element.maxLength - 12))
  }
  const lines = design.htmlPreset ? priced.map(element => sampleLine(element, element.max)) : Array.from({ length: Math.max(8, priced.length) }, (_, index) => ({ label: `សម្លៀកបំពាក់ Long item name ${index + 1}`, unit: 'piece' as const, quantity: 99, lineTotal: 9_999_000 }))
  return {
    values,
    order: { ...typical.order, number: 999_999, amount: design.htmlPreset && lines.length ? lines.reduce((sum, line) => sum + line.lineTotal, 0) : 999_999_000, customerName: 'សុខ ចាន់ដារ៉ា Sok Chandara', dueDate: date, lines, qrUrl: SAMPLE_QR },
    shop: { ...shop, name: `${shop.name} ${shop.name}` },
  }
}
