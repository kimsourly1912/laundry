import type { SlipData, SlipDesign, SlipShop, SlipValues } from '#shared/contracts/slip-design'
import type { CustomSample } from '#shared/contracts/templates'
import { sampleData, SAMPLE_SHOP } from '#shared/slip/fields'
import { checkFill } from '#shared/slip/values'

/**
 * The Studio's sample orders (D39; product notes → "preview blank, typical and crowded sample
 * orders"): blank shows the slip before anything is filled; typical, the usual values; crowded,
 * the longest text and the largest numbers, to see what overflows before publishing.
 */
export const SAMPLES = ['blank', 'typical', 'crowded'] as const
export type Sample = typeof SAMPLES[number]

const SAMPLE_QR = 'https://example.com/sample-laundry-slip'

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
  for (const field of customSampleFields(design)) {
    const value = Object.hasOwn(custom.values, field.id) ? custom.values[field.id] : undefined
    if (value !== undefined) values[field.id] = value
  }
  return { ...typical, values, order: { ...typical.order, customerName: custom.customerName, amount: custom.amount ?? typical.order.amount } }
}

export function sampleOrder(design: SlipDesign, options: { sample: Sample, date: string, shop?: SlipShop }): SlipData {
  const { sample, date, shop = SAMPLE_SHOP } = options
  if (sample === 'blank') {
    return { values: {}, order: { number: null, date: null, phone: null, amount: null, paid: null }, shop }
  }
  const typical = sampleData(design, { shop, date })
  if (sample === 'typical') {
    return { ...typical, order: { ...typical.order, customerName: 'Dara', dueDate: date, qrUrl: SAMPLE_QR } }
  }
  const values: SlipData['values'] = { ...typical.values }
  for (const element of design.elements) {
    if (element.type === 'number') values[element.id] = element.max
    if (element.type === 'textField') values[element.id] = 'ក'.repeat(Math.min(element.maxLength, 12)) + ' Long name'.slice(0, Math.max(0, element.maxLength - 12))
  }
  return {
    values,
    order: { ...typical.order, number: 999_999, amount: 999_999_000, customerName: 'សុខ ចាន់ដារ៉ា Sok Chandara', dueDate: date, qrUrl: SAMPLE_QR },
    shop: { ...shop, name: `${shop.name} ${shop.name}` },
  }
}
