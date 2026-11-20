import { blankDesign } from '#shared/contracts/slip-design'
import type { HtmlIntakePreset, SlipDesign } from '#shared/contracts/slip-design'
import { createElement } from '#shared/slip/elements'
import type { OwnerField } from '#shared/slip/fields'
import type { IntakeItem } from './items'
import { intakeField, intakeFieldId, intakeItem } from './items'

/*
 * The starter slips, 800 × 560 on 100 × 70 mm paper, laid out like a shop's paper ticket: labelled
 * boxes the order's values print into. By weight is a black-and-white card; By item a coloured
 * ticket with a garment grid; Mixed a blue card with the kilos and the common pieces side by side,
 * as most shops' paper slips have. Fields come from the item list (`items.ts`, D42). Satori ignores
 * `gap-*`, so spacing is margins, and every div with more than one child is `flex`. The markup is
 * indented so it reads well in the Studio's editor.
 */

/** A service checkbox's field id, label and label as HTML. */
const services = (keys: readonly string[]) => keys.map((key) => {
  const { label } = intakeItem(key)
  return { id: key, label, text: label.replaceAll('&', '&amp;') }
})
type Service = ReturnType<typeof services>[number]

const SERVICES = services(['wash_iron', 'dry_clean', 'iron_only'])
const MIXED_SERVICES = services(['wash_iron', 'dry_clean', 'iron_only', 'express'])

/** Garments on the By item grid, two columns of five. */
const GARMENTS = ['shirt', 'tshirt', 'trousers', 'jeans', 'dress', 'skirt', 'jacket', 'suit', 'blanket', 'towel'].map(intakeItem)

/** Pieces on the Mixed slip, beside the kilos: what Cambodian paper slips list most. */
const MIXED_PIECES = ['shirt', 'trousers', 'dress', 'coat', 'blanket', 'towel'].map(intakeItem)

/** Indents each line of a block by `depth` levels of two spaces. */
const indent = (depth: number, lines: string[]) => lines.map(line => `${'  '.repeat(depth)}${line}`)

function byWeightHtml(): string {
  const underline = (label: string, value: string) => [
    '<div class="mb-4 flex flex-row items-end">',
    `  <span class="mr-2 text-xl font-bold">${label}</span>`,
    `  <span class="flex-1 border-b-2 border-black text-center text-xl">${value}</span>`,
    '</div>',
  ]
  const box = (label: string, value: string, size = 'h-14') => [
    '<div class="flex flex-row items-center">',
    `  <span class="w-40 text-xl font-bold">${label}</span>`,
    `  <div class="flex ${size} flex-1 items-center border-2 border-black px-3 text-2xl font-bold">${value}</div>`,
    '</div>',
  ]
  const service = ({ id, text }: Service, last: boolean) => [
    `<div class="flex w-1/3 flex-row items-center border-2 border-black px-2 py-2${last ? '' : ' mr-2'}">`,
    `  <div class="mr-2 flex h-6 w-6 items-center justify-center border-2 border-black text-base font-bold">{{fields.${id}}}</div>`,
    `  <span class="text-base font-bold">${text}</span>`,
    '</div>',
  ]
  return [
    '<div class="flex h-full w-full bg-white p-4 text-black">',
    '  <div class="flex h-full w-full flex-row border-2 border-black p-5">',
    '    <div class="flex w-[34%] flex-col pr-5">',
    ...indent(3, underline('Ticket No.', '{{order.number}}')),
    ...indent(3, underline('Date', '{{order.date}}')),
    ...indent(3, underline('Customer', '{{customer.name}}')),
    '      <div class="flex self-center">{{order.qrCode}}</div>',
    '      <div class="mt-auto flex flex-col">',
    '        <span class="text-2xl font-bold uppercase leading-tight">{{shop.name}}</span>',
    '        <span class="text-base font-bold">TEL: {{shop.phone}}</span>',
    '      </div>',
    '    </div>',
    '    <div class="flex flex-1 flex-col justify-between">',
    ...indent(3, box('Weight', '{{fields.weight_kg}}', 'h-16')),
    '      <div class="flex flex-row">',
    ...indent(4, SERVICES.flatMap((item, index) => service(item, index === SERVICES.length - 1))),
    '      </div>',
    ...indent(3, box('Total', '{{order.total}}', 'h-16')),
    ...indent(3, box('Status', '{{order.paymentStatus}}')),
    ...indent(3, box('Phone', '{{order.phone}}')),
    '    </div>',
    '  </div>',
    '</div>',
  ].join('\n')
}

function byItemHtml(): string {
  const box = (label: string, value: string) => [
    '<div class="flex flex-row items-center">',
    `  <span class="w-28 text-lg font-bold text-pink-700">${label}</span>`,
    `  <div class="flex min-h-[40px] flex-1 items-center rounded-md border-2 border-pink-600 px-2 py-1 text-lg leading-tight">${value}</div>`,
    '</div>',
  ]
  const cell = (label: string, value: string, last: boolean) => [
    `<div class="flex w-1/2 flex-col rounded-md border-2 border-pink-600${last ? '' : ' mr-2'}">`,
    `  <span class="bg-pink-600 text-center text-base font-bold text-white">${label}</span>`,
    `  <span class="flex h-10 items-center justify-center text-xl font-bold">${value}</span>`,
    '</div>',
  ]
  const service = ({ id, text }: Service, last: boolean) => [
    `<div class="flex w-1/3 flex-row items-center px-1 py-2${last ? '' : ' border-r-2 border-pink-600'}">`,
    `  <div class="mr-1 flex h-5 w-5 items-center justify-center border-2 border-pink-600 text-sm font-bold text-pink-700">{{fields.${id}}}</div>`,
    `  <span class="text-sm font-bold text-pink-700">${text}</span>`,
    '</div>',
  ]
  const garment = (entry: IntakeItem, last: boolean) => [
    `<div class="flex flex-1 flex-row${last ? '' : ' border-b-2 border-white'}">`,
    `  <span class="flex flex-1 items-center justify-center bg-pink-600 text-base font-bold text-white">${entry.label}</span>`,
    `  <span class="flex w-14 items-center justify-center border-l-2 border-pink-600 bg-white text-lg font-bold">{{fields.${intakeFieldId(entry)}}}</span>`,
    '</div>',
  ]
  const column = (items: readonly IntakeItem[], first: boolean) => [
    `<div class="flex flex-1 flex-col border-2 border-pink-600${first ? ' mr-2' : ''}">`,
    ...indent(1, items.flatMap((item, index) => garment(item, index === items.length - 1))),
    '</div>',
  ]
  return [
    '<div class="flex h-full w-full flex-row bg-pink-600 p-3 text-black">',
    '  <div class="flex w-[24%] flex-col items-center justify-between py-3 pr-3">',
    '    <span class="text-center text-3xl font-bold leading-tight text-white">{{shop.name}}</span>',
    '    <div class="flex rounded-lg bg-white p-1">{{order.qrCode}}</div>',
    '    <span class="text-center text-xl font-bold text-white">{{shop.phone}}</span>',
    '  </div>',
    '  <div class="flex flex-1 flex-row rounded-lg bg-white p-4">',
    '    <div class="flex w-[52%] flex-col justify-between pr-4">',
    ...indent(3, box('Ticket No.', '{{order.number}}')),
    ...indent(3, box('Customer', '{{customer.name}}')),
    ...indent(3, box('Date', '{{order.date}}')),
    ...indent(3, box('Phone', '{{order.phone}}')),
    '      <div class="flex flex-row">',
    ...indent(4, [...cell('Total', '{{order.total}}', false), ...cell('Status', '{{order.paymentStatus}}', true)]),
    '      </div>',
    '      <div class="flex flex-row rounded-md border-2 border-pink-600">',
    ...indent(4, SERVICES.flatMap((item, index) => service(item, index === SERVICES.length - 1))),
    '      </div>',
    '    </div>',
    '    <div class="flex flex-1 flex-row">',
    ...indent(3, column(GARMENTS.slice(0, 5), true)),
    ...indent(3, column(GARMENTS.slice(5), false)),
    '    </div>',
    '  </div>',
    '</div>',
  ].join('\n')
}

function mixedHtml(): string {
  const underline = (label: string, value: string) => [
    '<div class="mb-3 flex flex-row items-end">',
    `  <span class="mr-2 text-lg font-bold text-blue-800">${label}</span>`,
    `  <span class="flex-1 border-b-2 border-blue-800 text-center text-lg">${value}</span>`,
    '</div>',
  ]
  /** A labelled box; `width` is its share of the row, every box but a row's last has a gap after it, and `text` sizes a text value. */
  const cell = (label: string, value: string, options: { width: string, last: boolean, text?: string }) => [
    `<div class="flex ${options.width} flex-col${options.last ? '' : ' mr-2'}">`,
    `  <span class="text-sm font-bold text-blue-800">${label}</span>`,
    `  <div class="flex h-11 items-center justify-center border-2 border-blue-800 px-1 ${options.text ?? 'text-xl'} font-bold">${value}</div>`,
    '</div>',
  ]
  const row = (cells: string[][]) => ['<div class="flex flex-row">', ...indent(1, cells.flat()), '</div>']
  const piece = (entry: IntakeItem, last: boolean) => cell(entry.label, `{{fields.${intakeFieldId(entry)}}}`, { width: 'w-1/3', last })
  const service = ({ id, text }: Service, last: boolean) => [
    `<div class="flex w-1/4 flex-row items-center border-2 border-blue-800 px-1 py-1${last ? '' : ' mr-2'}">`,
    `  <div class="mr-1 flex h-5 w-5 items-center justify-center border-2 border-blue-800 text-sm font-bold">{{fields.${id}}}</div>`,
    `  <span class="text-sm font-bold leading-tight text-blue-800">${text}</span>`,
    '</div>',
  ]
  const [first, second, third, fourth, fifth, last] = MIXED_PIECES as [IntakeItem, IntakeItem, IntakeItem, IntakeItem, IntakeItem, IntakeItem]
  return [
    '<div class="flex h-full w-full bg-white p-4 text-black">',
    '  <div class="flex h-full w-full flex-row border-2 border-blue-800 p-4">',
    '    <div class="flex w-[30%] flex-col pr-4">',
    ...indent(3, underline('No.', '{{order.number}}')),
    ...indent(3, underline('Date', '{{order.date}}')),
    ...indent(3, underline('Customer', '{{customer.name}}')),
    '      <div class="flex self-center">{{order.qrCode}}</div>',
    '      <div class="mt-auto flex flex-col">',
    '        <span class="text-2xl font-bold uppercase leading-tight text-blue-800">{{shop.name}}</span>',
    '        <span class="text-base font-bold">TEL: {{shop.phone}}</span>',
    '      </div>',
    '    </div>',
    '    <div class="flex flex-1 flex-col justify-between">',
    ...indent(3, row([cell('Kilo', '{{fields.wash_kg}}', { width: 'w-1/3', last: false }), piece(first, false), piece(second, true)])),
    ...indent(3, row([piece(third, false), piece(fourth, false), piece(fifth, true)])),
    ...indent(3, row([piece(last, false), cell('Other', '{{fields.other}}', { width: 'flex-1', last: true, text: 'text-base leading-tight' })])),
    ...indent(3, row(MIXED_SERVICES.map((item, index) => service(item, index === MIXED_SERVICES.length - 1)))),
    ...indent(3, row([cell('Payment', '{{order.total}}', { width: 'flex-1', last: false }), cell('Status', '{{order.paymentStatus}}', { width: 'w-1/3', last: true })])),
    ...indent(3, row([cell('Tel', '{{order.phone}}', { width: 'flex-1', last: false }), cell('Received by', '{{fields.received_by}}', { width: 'w-1/3', last: true, text: 'text-base leading-tight' })])),
    '    </div>',
    '  </div>',
    '</div>',
  ].join('\n')
}

const HTML: Record<HtmlIntakePreset, () => string> = { byWeight: byWeightHtml, byItem: byItemHtml, mixed: mixedHtml }

/** The intake fields a preset starts with, before the fixed phone, amount and paid spots. */
function presetFields(preset: HtmlIntakePreset): { counts: OwnerField[], rest: OwnerField[] } {
  const checkboxes = (list: readonly Service[]) => list.map(({ id }) => intakeField(intakeItem(id)))
  if (preset === 'byWeight') {
    return {
      counts: [createElement('number', { id: 'weight_kg' }, { label: 'Weight', unit: 'kg', decimals: 2, min: 0.01, max: 100, required: true, printRequired: true })],
      rest: checkboxes(SERVICES),
    }
  }
  if (preset === 'byItem') return { counts: GARMENTS.map(intakeField), rest: checkboxes(SERVICES) }
  return {
    counts: [{ ...intakeField(intakeItem('wash_kg')), label: 'Weight' }, ...MIXED_PIECES.map(intakeField)],
    rest: [intakeField(intakeItem('other')), ...checkboxes(MIXED_SERVICES), intakeField(intakeItem('received_by'))],
  }
}

export function newHtmlSlip(preset: HtmlIntakePreset = 'byWeight'): SlipDesign {
  const { counts, rest } = presetFields(preset)
  const fixed = [
    createElement('phone', { id: 'phone' }),
    createElement('amount', { id: 'total' }),
    createElement('paid', { id: 'paid-yes' }, { value: 'paid' }),
    createElement('paid', { id: 'paid-no' }, { value: 'unpaid', label: 'Not paid' }),
  ]
  return {
    ...blankDesign(800, 560),
    html: HTML[preset](),
    htmlPreset: preset,
    paper: { widthMm: 100, heightMm: 70 },
    elements: [...counts, ...rest, ...fixed],
    fillOrder: ['phone', ...counts.map(field => field.id), ...rest.map(field => field.id), 'total', 'paid'],
  }
}
