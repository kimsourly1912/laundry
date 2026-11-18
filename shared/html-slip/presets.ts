import { blankDesign } from '#shared/contracts/slip-design'
import type { HtmlIntakePreset, SlipDesign } from '#shared/contracts/slip-design'
import { createElement } from '#shared/slip/elements'

const header = '  <div class="flex flex-row items-center justify-between border-b pb-2"><span class="font-bold">{{shop.name}}</span><span>No. {{order.number}}</span></div>'
const footer = '  <div class="flex flex-row items-end justify-between"><span class="font-bold">Total: {{order.total}}</span><div class="flex">{{order.qrCode}}</div></div>'

export function newHtmlSlip(preset: HtmlIntakePreset = 'byWeight'): SlipDesign {
  const byWeight = preset === 'byWeight'
  const fields = byWeight
    ? [createElement('number', { id: 'weight_kg' }, { label: 'Weight', unit: 'kg', decimals: 2, min: 0.01, max: 100, required: true, printRequired: true, priceKey: 'wash_kg' })]
    : [
        createElement('number', { id: 'shirt_count' }, { label: 'Shirts', priceKey: 'shirt' }),
        createElement('number', { id: 'trousers_count' }, { label: 'Trousers', priceKey: 'trousers' }),
      ]
  const html = [
    '<div class="flex h-full w-full flex-col gap-4 p-6">',
    header,
    '  <div class="flex flex-row justify-between"><span>{{customer.name}}</span><span>{{order.date}}</span></div>',
    byWeight
      ? '  <div class="flex border-b pb-2"><span>Weight: {{fields.weight_kg}}</span></div>'
      : '  <div class="flex flex-col border-b pb-2">{{order.itemLines}}</div>',
    footer,
    '</div>',
  ].join('\n')
  const fixed = [
    createElement('phone', { id: 'phone' }),
    createElement('amount', { id: 'total' }),
    createElement('paid', { id: 'paid-yes' }, { value: 'paid' }),
    createElement('paid', { id: 'paid-no' }, { value: 'unpaid', label: 'Not paid' }),
  ]
  return {
    ...blankDesign(800, 560),
    html,
    htmlPreset: preset,
    paper: { widthMm: 100, heightMm: 70 },
    elements: [...fields, ...fixed],
    fillOrder: ['phone', ...fields.map(field => field.id), 'total', 'paid'],
  }
}
