import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { blankHtmlSlip, newHtmlSlip } from '../presets'
import { isOwnerField } from '#shared/slip/fields'
import { customSampleOrder, sampleOrder } from '../sample'
import { previewHtmlTemplateSchema } from '#shared/contracts/templates'
import { publishProblems } from '#shared/slip/checks'
import { blankDesign } from '#shared/contracts/slip-design'
import type { SlipData, SlipDesign } from '#shared/contracts/slip-design'
import { createElement, createGroup } from '#shared/slip/elements'
import { parseHtml } from '#shared/html-slip/parse'
import { checkHtml, isKnownUtility } from '#shared/html-slip/catalog'
import { placeholderText, slipTree } from '#shared/html-slip/build'
import type { SatoriNode } from '#shared/html-slip/build'
import { aiPrompt, readAiAnswer } from '#shared/html-slip/ai'

describe('A new template (blankHtmlSlip)', () => {
  it('starts with no markup and only the built-in fields, for the platform to add the rest', () => {
    const blank = blankHtmlSlip()
    expect(blank.html).toBe('')
    expect(blank.elements.filter(isOwnerField).map(field => field.type)).toEqual(['phone', 'amount'])
    expect(blank.elements.filter(element => element.type === 'paid')).toHaveLength(2)
    expect(blank.fillOrder).toEqual(['phone', 'total', 'paid'])
    expect(blank.paper).toEqual({ widthMm: 100, heightMm: 70 })
  })
})

describe('Custom sample (Test order)', () => {
  const design = newHtmlSlip('byWeight')
  const date = '2026-11-19'
  const custom = { customerName: 'សុខ ចាន់ដារ៉ា Sok Chandara', amount: 10500, values: { weight_kg: 3.5 } }

  it('fills the slip with the test values and the typed total', () => {
    const slip = customSampleOrder(design, { custom, date })
    expect(slip.values).toEqual({ weight_kg: 3.5 })
    expect(slip.order).toMatchObject({
      customerName: custom.customerName,
      amount: 10500,
      date,
      number: 1024,
      qrUrl: 'https://example.com/sample-laundry-slip',
    })
    const empty = customSampleOrder(design, { custom: { ...custom, amount: 0, values: {} }, date })
    expect(empty.values).toEqual({})
    expect(empty.order).toMatchObject({ amount: 0 })
  })

  it('prints a manual total as typed, apart from the counts', () => {
    // Pilot plan §1: Shirt = 5 and Total = 7,000៛ (D44: every slip takes a typed total).
    const manual = { ...newHtmlSlip('byItem') }
    const slip = customSampleOrder(manual, { custom: { customerName: '', amount: 7000, values: { shirt_count: 5 } }, date })
    expect(slip.values).toEqual({ shirt_count: 5 })
    expect(slip.order).toMatchObject({ amount: 7000 })
    expect(placeholderText('fields.shirt_count', manual, slip)).toBe('5')
    expect(placeholderText('order.total', manual, slip)).toBe('7,000៛')
  })

  it('accepts ordinary previews and validates custom values against the design', () => {
    expect(v.parse(previewHtmlTemplateSchema, { design }).sample).toBe('typical')
    expect(v.safeParse(previewHtmlTemplateSchema, { design, sample: 'custom', custom }).success).toBe(true)
    for (const values of [{ other: 3 }, { weight_kg: '3' }, { weight_kg: 1001 }, { weight_kg: 3.555 }]) {
      expect(v.safeParse(previewHtmlTemplateSchema, { design, sample: 'custom', custom: { ...custom, values } }).success).toBe(false)
    }
    expect(v.safeParse(previewHtmlTemplateSchema, { design, sample: 'custom', custom: { ...custom, number: 123 } }).success).toBe(false)
  })
})

// HTML slips (D39): the markup is data, checked against one catalog; values go in as text only.

const design: SlipDesign = {
  ...blankDesign(600, 400),
  elements: [
    createElement('number', { id: 'shirt' }, { label: 'អាវ / Shirt' }),
    createElement('textField', { id: 'note' }, { label: 'Note' }),
    createElement('option', { id: 'wash' }, { group: 'svc', label: 'Wash + iron' }),
    createElement('option', { id: 'iron' }, { group: 'svc', label: 'Iron only' }),
  ],
  groups: [createGroup('svc', { label: 'Service' })],
}

const data = (extra: Partial<SlipData['order']> = {}, values: SlipData['values'] = {}): SlipData => ({
  values,
  order: { number: 2139, date: '2026-11-18', phone: '+85512345678', amount: 7000, paid: false, customerName: 'Dara', dueDate: '2026-11-20', ...extra },
  shop: { name: 'Linda Laundry', phone: '012 345 678', address: null, logoImageId: null, currency: 'KHR' },
})

/** All text in a tree, in order. */
function texts(node: SatoriNode | string): string[] {
  if (typeof node === 'string') return [node]
  const children = node.props.children
  if (children === undefined) return []
  return (Array.isArray(children) ? children : [children]).flatMap(texts)
}

describe('parseHtml', () => {
  it('reads the allowed tags, classes and text, decoding entities', () => {
    const { nodes, problems } = parseHtml('<div class="flex gap-2"><span class="font-bold">A &amp; B</span><br/><p>x&lt;y</p></div>')
    expect(problems).toEqual([])
    expect(nodes).toMatchObject([{ tag: 'div', classes: ['flex', 'gap-2'], children: [{ tag: 'span', children: [{ text: 'A & B' }] }, { tag: 'br' }, { tag: 'p', children: [{ text: 'x<y' }] }] }])
  })

  it('names each problem with its line and column', () => {
    const { problems } = parseHtml('<div>\n  <input src="x">\n  <span onclick="go()">hi</span>\n  <b>open\n</div>\ntext')
    expect(problems.map(problem => `${problem.line}:${problem.column} ${problem.message.split(' ').slice(0, 3).join(' ')}`)).toEqual([
      '2:3 <input> isn\'t allowed.',
      '2:3 The attribute src',
      '3:3 The attribute onclick',
      '4:3 <b> is never',
      '6:1 Text outside every',
    ])
  })

  it('keeps a script out entirely: an unknown tag becomes a plain box, its text only text', () => {
    const { nodes, problems } = parseHtml('<div><script>alert(1)</script></div>')
    expect(problems.map(problem => problem.message)).toEqual([expect.stringContaining('<script> isn\'t allowed')])
    expect(nodes).toMatchObject([{ tag: 'div', children: [{ tag: 'div', children: [{ text: 'alert(1)' }] }] }])
  })
})

describe('checkHtml (the catalog)', () => {
  it('accepts the catalog\'s placeholders and the design\'s fields; names unknown ones and utilities', () => {
    const ok = checkHtml('<div class="flex flex-col p-4 text-[28px] border-2 w-1/2">{{order.number}} {{fields.shirt}} {{fields.svc}}<div>{{order.qrCode}}</div></div>', design)
    expect(ok.problems).toEqual([])
    // D44: there are no priced lines to draw.
    expect(checkHtml('<div><div>{{order.itemLines}}</div></div>', design).problems.map(problem => problem.message.slice(0, 40))).toEqual(['{{order.itemLines}} isn\'t a placeholder.'])
    const bad = checkHtml('<div class="flex hover:bg-red-500 animate-spin">{{order.secret}} {{fields.coat}}</div>', design)
    expect(bad.problems.map(problem => problem.message.slice(0, 40))).toEqual([
      'The class hover:bg-red-500 isn\'t support',
      'The class animate-spin isn\'t supported (',
      '{{order.secret}} isn\'t a placeholder. Us',
      '{{fields.coat}} isn\'t a placeholder. Use',
    ])
  })

  it('knows common Tailwind utilities', () => {
    for (const name of ['grid', 'grid-cols-3', 'items-center', 'justify-between', 'mt-2', '-mt-1', 'px-[12px]', 'text-sm', 'text-right', 'font-bold', 'leading-tight', 'border-b', 'border-gray-400', 'rounded-md', 'bg-white', 'uppercase', 'tabular-nums', 'w-full', 'h-[40px]']) {
      expect(isKnownUtility(name), name).toBe(true)
    }
  })
})

describe('slipTree (values as text)', () => {
  it('fills placeholders from the order; a field shows its value, a choice its label', () => {
    const { nodes } = parseHtml('<div><span>No. {{order.number}}</span><span>{{fields.shirt}} · {{fields.svc}} · {{customer.name}} · {{order.total}} · {{order.paymentStatus}} · {{order.dueDate}}</span></div>')
    const tree = slipTree({ nodes, design, data: data({}, { shirt: 2, svc: 'iron' }) })
    expect(texts(tree).join('')).toBe('No. 21392 · Iron only · Dara · 7,000៛ · Not paid · 20/11/2026')
  })

  it('a value that looks like markup stays text: it never adds an element', () => {
    const { nodes } = parseHtml('<div>{{fields.note}}</div>')
    const tree = slipTree({ nodes, design, data: data({}, { note: '<script>alert(1)</script>' }) })
    expect(texts(tree)).toEqual(['<script>alert(1)</script>'])
    expect(JSON.stringify(tree)).not.toContain('"type":"script"')
  })

  it('draws the QR (a sample before saving, the order\'s link after)', () => {
    const { nodes } = parseHtml('<div><div>{{order.qrCode}}</div></div>')
    const sample = slipTree({ nodes, design, data: data() })
    expect(texts(sample)).toEqual(['QR'])
    const linked = JSON.stringify(slipTree({ nodes, design, data: data({ qrUrl: 'https://t.me/bot?start=abc' }) }))
    expect(linked).toContain('"type":"img"')
    expect(linked).toContain('data:image/svg+xml;base64,')
  })

  it('leaves out what a draft doesn\'t have yet', () => {
    expect(placeholderText('order.number', design, data({ number: null }))).toBe('')
    expect(placeholderText('order.paymentStatus', design, data({ paid: null }))).toBe('')
  })
})

describe('the AI import (v1)', () => {
  it('reads the JSON object, in a ```json fence or not', () => {
    const answer = { version: 1, name: 'Compact', html: '<div>{{order.number}}</div>', reviewNotes: ['Check the Khmer footer'] }
    expect(readAiAnswer(JSON.stringify(answer))).toEqual({ answer })
    expect(readAiAnswer(`Here it is:\n\`\`\`json\n${JSON.stringify(answer)}\n\`\`\``)).toEqual({ answer })
  })

  it('says where it went wrong: bad JSON with its line, a wrong version, an unknown key', () => {
    expect(readAiAnswer('{\n  "version": 1,\n  "name": oops\n}')).toEqual({ problems: [{ where: 'line 3, column 11', message: expect.stringContaining('not valid JSON') }] })
    expect(readAiAnswer(JSON.stringify({ version: 2, name: 'x', html: '<div></div>' }))).toEqual({ problems: [{ where: 'version', message: 'version must be 1' }] })
    expect(readAiAnswer(JSON.stringify({ version: 1, name: 'x', html: '<div></div>', css: 'body{}' }))).toEqual({ problems: [{ where: 'css', message: expect.stringContaining('Unknown key') }] })
  })

  it('finds the error after escaped quotes, as AI-written HTML has them', async () => {
    const { jsonErrorAt } = await import('#shared/html-slip/ai')
    const text = '{"html": "<div class=\\"flex\\">\\u00e9</div>", "name": x}'
    expect(jsonErrorAt(text)).toBe(text.indexOf('x}'))
    expect(jsonErrorAt('{"a": [1, 2.5e3, true, null, "\\n"]}')).toBeUndefined()
  })

  it('the prompt lists the catalog and the slip\'s own fields', () => {
    const prompt = aiPrompt({ design: { ...design, paper: { widthMm: 80, heightMm: 52 } }, brief: 'Redesign it: bigger boxes' })
    expect(prompt).toContain('{{order.number}}')
    expect(prompt).toContain('{{order.qrCode}}')
    expect(prompt).toContain('{{fields.shirt}}: អាវ / Shirt (number; example: 2)')
    expect(prompt).toContain('80 × 52 mm')
    expect(prompt).toContain('Redesign it: bigger boxes')
  })

  it('tells the AI how to draw a logo as inline SVG, and lists only the slip\'s own images (D41)', () => {
    const none = aiPrompt({ design, brief: '' })
    expect(none).toContain('inline <svg> with a viewBox')
    expect(none).toContain('No <text> inside an <svg>')
    expect(none).toContain('Use no <img>')
    const id = '0190f2a0-0000-7000-8000-000000000001'
    const withImage = aiPrompt({ design: { ...design, html: `<div><img src="image:${id}" class="w-12"></div>` }, brief: '' })
    expect(withImage).toContain(`<img src="image:${id}" class="w-24">`)
  })
})

describe('sampleOrder (the Studio\'s blank, typical and crowded)', () => {
  it('blank fills nothing; typical has a customer and a total; crowded has the largest and the longest', async () => {
    const { sampleOrder } = await import('#shared/html-slip/sample')
    const counts: SlipDesign = { ...design, elements: [createElement('number', { id: 'shirt' }, { label: 'Shirt' }), createElement('number', { id: 'pants' }, { label: 'Pants' })] }
    expect(sampleOrder(counts, { sample: 'blank', date: '2026-11-18' }).order).toMatchObject({ number: null, amount: null })
    const typical = sampleOrder(counts, { sample: 'typical', date: '2026-11-18' })
    expect(typical.order).toMatchObject({ customerName: 'Dara', dueDate: '2026-11-18' })
    const crowded = sampleOrder(counts, { sample: 'crowded', date: '2026-11-18' })
    expect(crowded.order.amount).toBe(999_999_000)
    expect(crowded.values.shirt).toBe(999)
  })
})

describe('HTML intake presets', () => {
  it('starts every preset on a manual total: no field carries a price (D44)', () => {
    for (const preset of ['byWeight', 'byItem', 'mixed'] as const) {
      const design = newHtmlSlip(preset)
      expect(design.elements.filter(element => 'priceKey' in element)).toEqual([])
      expect(design.elements.some(element => element.type === 'amount')).toBe(true)
    }
  })

  it('publishes with the starter bindings and fills the weight in the typical sample only', () => {
    const design = newHtmlSlip('byWeight')
    expect(publishProblems(design).errors).toEqual([])
    const typical = sampleOrder(design, { sample: 'typical', date: '2026-11-18' })
    expect(typeof typical.values.weight_kg).toBe('number')
    const blank = sampleOrder(design, { sample: 'blank', date: '2026-11-18' })
    expect(blank.values.weight_kg).toBeUndefined()
  })

  it('requires the configured print binding and standalone QR and disallows expressions', () => {
    const design = newHtmlSlip('byWeight')
    const html = design.html!.replace('{{fields.weight_kg}}', '{{order.total + 1}}').replace('{{order.qrCode}}', 'QR {{order.qrCode}}')
    const changed = { ...design, html }
    expect(checkHtml(html, changed).problems.map(problem => problem.message)).toEqual(expect.arrayContaining([
      'Write a binding as {{name}} using a key from the catalog.',
      'Put {{order.qrCode}} by itself inside a div.',
    ]))
    expect(publishProblems(changed).errors).toContainEqual({ code: 'missingPrintBinding', key: 'fields.weight_kg' })
  })

  it('By item publishes with a count for every garment on the grid', () => {
    const design = newHtmlSlip('byItem')
    expect(publishProblems(design).errors).toEqual([])
    expect(design.fillOrder).toContain('shirt_count')
    expect(design.fillOrder).toContain('trousers_count')
    const garments = design.elements.filter(element => element.type === 'number' && element.id.endsWith('_count'))
    expect(garments).toHaveLength(10)
    expect(checkHtml(design.html!, design).problems).toEqual([])
  })
})
