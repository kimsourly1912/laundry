import type { SlipData, SlipDesign, SlipShop } from '#shared/contracts/slip-design'
import { sampleData, SAMPLE_SHOP } from '#shared/slip/fields'

/**
 * The Studio's sample orders (D39; product notes → "preview blank, typical and crowded sample
 * orders"): blank shows the slip before anything is filled; typical, the usual values; crowded,
 * the longest text and the most lines, to see what overflows before publishing.
 */
export const SAMPLES = ['blank', 'typical', 'crowded'] as const
export type Sample = typeof SAMPLES[number]

export function sampleOrder(design: SlipDesign, options: { sample: Sample, date: string, shop?: SlipShop }): SlipData {
  const { sample, date, shop = SAMPLE_SHOP } = options
  if (sample === 'blank') {
    return { values: {}, order: { number: null, date: null, phone: null, amount: null, paid: null, lines: [] }, shop }
  }
  const typical = sampleData(design, { shop, date })
  const priced = design.elements.filter(element => element.type === 'number' && element.priceKey)
  if (sample === 'typical') {
    const lines = priced.map(element => ({ label: 'label' in element ? element.label : '', unit: 'piece' as const, quantity: 2, lineTotal: 4000 }))
    // An itemized slip's total is its lines' (D39), as an order's is.
    const amount = lines.length ? lines.reduce((sum, line) => sum + line.lineTotal, 0) : typical.order.amount
    return { ...typical, order: { ...typical.order, amount, customerName: 'Dara', dueDate: date, lines, qrUrl: null } }
  }
  const values: SlipData['values'] = { ...typical.values }
  for (const element of design.elements) {
    if (element.type === 'number') values[element.id] = element.max
    if (element.type === 'textField') values[element.id] = 'ក'.repeat(Math.min(element.maxLength, 12)) + ' Long name'.slice(0, Math.max(0, element.maxLength - 12))
  }
  const lines = Array.from({ length: Math.max(8, priced.length) }, (_, index) => ({ label: `សម្លៀកបំពាក់ Long item name ${index + 1}`, unit: 'piece' as const, quantity: 99, lineTotal: 9_999_000 }))
  return {
    values,
    order: { ...typical.order, number: 999_999, amount: 999_999_000, customerName: 'សុខ ចាន់ដារ៉ា Sok Chandara', dueDate: date, lines, qrUrl: null },
    shop: { ...shop, name: `${shop.name} ${shop.name}` },
  }
}
