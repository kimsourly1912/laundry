import { describe, expect, it } from 'vitest'
import { newHtmlSlip } from '../presets'
import { sampleOrder } from '../sample'
import { publishProblems } from '#shared/slip/checks'
import { blankDesign } from '#shared/contracts/slip-design'
import type { SlipData, SlipDesign } from '#shared/contracts/slip-design'
import { createElement, createGroup } from '#shared/slip/elements'
import { parseHtml } from '#shared/html-slip/parse'
import { checkHtml, isKnownUtility } from '#shared/html-slip/catalog'
import { placeholderText, slipTree } from '#shared/html-slip/build'
import type { SatoriNode } from '#shared/html-slip/build'
import { aiPrompt, readAiAnswer } from '#shared/html-slip/ai'

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
  order: { number: 2139, date: '2026-11-18', phone: '+85512345678', amount: 7000, paid: false, customerName: 'Dara', dueDate: '2026-11-20', lines: [{ label: 'Shirt', unit: 'piece', quantity: 2, lineTotal: 4000 }], ...extra },
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
    const { problems } = parseHtml('<div>\n  <img src="x">\n  <span onclick="go()">hi</span>\n  <b>open\n</div>\ntext')
    expect(problems.map(problem => `${problem.line}:${problem.column} ${problem.message.split(' ').slice(0, 3).join(' ')}`)).toEqual([
      '2:3 <img> isn\'t allowed.',
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
    const ok = checkHtml('<div class="flex flex-col p-4 text-[28px] border-2 w-1/2">{{order.number}} {{fields.shirt}} {{fields.svc}}<div>{{order.itemLines}}</div></div>', design)
    expect(ok.problems).toEqual([])
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
    const tree = slipTree(nodes, design, data({}, { shirt: 2, svc: 'iron' }))
    expect(texts(tree).join('')).toBe('No. 21392 · Iron only · Dara · 7,000៛ · Not paid · 20/11/2026')
  })

  it('a value that looks like markup stays text: it never adds an element', () => {
    const { nodes } = parseHtml('<div>{{fields.note}}</div>')
    const tree = slipTree(nodes, design, data({}, { note: '<script>alert(1)</script>' }))
    expect(texts(tree)).toEqual(['<script>alert(1)</script>'])
    expect(JSON.stringify(tree)).not.toContain('"type":"script"')
  })

  it('draws the item lines and the QR (a sample before saving, the order\'s link after)', () => {
    const { nodes } = parseHtml('<div><div>{{order.itemLines}}</div><div>{{order.qrCode}}</div></div>')
    const sample = slipTree(nodes, design, data())
    expect(texts(sample)).toEqual(['Shirt', '2', '4,000៛', 'QR'])
    const linked = JSON.stringify(slipTree(nodes, design, data({ qrUrl: 'https://t.me/bot?start=abc' })))
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
    expect(prompt).toContain('{{fields.shirt}}: អាវ / Shirt (number)')
    expect(prompt).toContain('80 × 52 mm')
    expect(prompt).toContain('Redesign it: bigger boxes')
  })
})

describe('sampleOrder (the Studio\'s blank, typical and crowded)', () => {
  it('blank fills nothing; typical totals its lines; crowded has the most and the longest', async () => {
    const { sampleOrder } = await import('#shared/html-slip/sample')
    const priced: SlipDesign = { ...design, elements: [createElement('number', { id: 'shirt' }, { label: 'Shirt', priceKey: 'shirt' }), createElement('number', { id: 'pants' }, { label: 'Pants', priceKey: 'pants' })] }
    expect(sampleOrder(priced, { sample: 'blank', date: '2026-11-18' }).order).toMatchObject({ number: null, amount: null, lines: [] })
    const typical = sampleOrder(priced, { sample: 'typical', date: '2026-11-18' })
    expect(typical.order.amount).toBe(8000)
    const crowded = sampleOrder(priced, { sample: 'crowded', date: '2026-11-18' })
    expect(crowded.order.lines!.length).toBeGreaterThanOrEqual(8)
    expect(crowded.values.shirt).toBe(999)
  })
})

describe('HTML intake presets', () => {
  it('publishes with the starter bindings and shows the same priced sample weight and total', () => {
    const design = newHtmlSlip('byWeight')
    expect(publishProblems(design).errors).toEqual([])
    const typical = sampleOrder(design, { sample: 'typical', date: '2026-11-18' })
    expect(typical.values.weight_kg).toBe(2.5)
    expect(typical.order.lines).toEqual([{ label: 'Weight', unit: 'kg', quantity: 2500, lineTotal: 7500 }])
    expect(typical.order.amount).toBe(7500)
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

  it('supports by-item totals from the starter garment keys', () => {
    const design = newHtmlSlip('byItem')
    expect(publishProblems(design).errors).toEqual([])
    expect(design.fillOrder).toContain('shirt_count')
    expect(design.fillOrder).toContain('trousers_count')
    expect(sampleOrder(design, { sample: 'typical', date: '2026-11-18' }).order.lines).toHaveLength(2)
  })
})
