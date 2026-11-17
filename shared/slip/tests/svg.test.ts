import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { blankDesign, designSchema } from '#shared/contracts/slip-design'
import type { SlipData, SlipDesign, SlipElement } from '#shared/contracts/slip-design'
import { createElement, createGroup } from '#shared/slip/elements'
import { fillOrderOf, sampleData, SAMPLE_SHOP, valueText } from '#shared/slip/fields'
import { escapeXml, imagesOf, slipSvg, textHeight, wrapLines } from '#shared/slip/svg'
import { testSlipText } from './support'

const text = testSlipText()
const IMAGE = '0190f2a0-0000-7000-8000-000000000001'

function design(elements: SlipElement[], extra: Partial<SlipDesign> = {}): SlipDesign {
  return { ...blankDesign(800, 500), elements, ...extra }
}

const empty: SlipData = { values: {}, order: { number: null, date: null, phone: null, amount: null, paid: null }, shop: SAMPLE_SHOP }

function svgOf(slip: SlipDesign, data: SlipData = empty, imageHref = (id: string) => `data:image/png;base64,${id}`) {
  return slipSvg({ design: slip, data, text, imageHref })
}

describe('designSchema', () => {
  it('accepts a design with every element type', () => {
    const group = createGroup('service', { label: { en: 'Service', km: 'សេវា' } })
    const elements = [
      createElement('text', { id: 't' }),
      createElement('rect', { id: 'r' }),
      createElement('ellipse', { id: 'e' }),
      createElement('triangle', { id: 'tr' }),
      createElement('line', { id: 'l' }),
      createElement('icon', { id: 'i' }, { icon: 'star' }),
      createElement('image', { id: 'img' }, { imageId: IMAGE }),
      createElement('shopInfo', { id: 's' }),
      createElement('number', { id: 'n' }),
      createElement('textField', { id: 'tf' }),
      createElement('checkbox', { id: 'c' }),
      createElement('option', { id: 'o' }, { group: 'service' }),
      createElement('orderNo', { id: 'no' }),
      createElement('date', { id: 'd' }),
      createElement('phone', { id: 'p' }),
      createElement('amount', { id: 'a' }),
      createElement('paid', { id: 'pd' }),
    ]
    const result = v.safeParse(designSchema, design(elements, { groups: [group] }))
    expect(result.issues).toBeUndefined()
  })

  it('refuses duplicate ids, options of no group, a minimum over the maximum and unknown keys', () => {
    const issues = (slip: unknown) => v.safeParse(designSchema, slip).issues?.map(issue => issue.message)
    expect(issues(design([createElement('rect', { id: 'a' }), createElement('text', { id: 'a' })]))).toEqual(['Each element and choice group needs its own id'])
    expect(issues(design([createElement('rect', { id: 'paid' })]))).toEqual(['Each element and choice group needs its own id'])
    expect(issues(design([createElement('option', { id: 'o' }, { group: 'nope' })]))).toEqual(['An option belongs to a choice group that doesn\'t exist'])
    expect(issues(design([createElement('number', { id: 'n' }, { min: 5, max: 1 })]))).toEqual(['A number field\'s minimum is above its maximum'])
    expect(issues({ ...design([]), extra: 1 })).toHaveLength(1)
    expect(issues(design([{ ...createElement('rect', { id: 'r' }), script: 'x' } as SlipElement]))).toHaveLength(1)
    expect(issues(design([createElement('rect', { id: 'r' }, { fill: 'red' })]))).toEqual(['Must be a colour like #1f2937'])
    expect(issues({ ...design([]), width: 199 })).toEqual(['At least 200 px'])
  })
})

describe('slipSvg', () => {
  it('draws the canvas at its size, its background colour and image, and no text elements', () => {
    const svg = svgOf(design([createElement('text', { id: 't', w: 400 }, { text: 'សេវា Shirt' })], { background: { color: '#fafafa', imageId: IMAGE } }))
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="800" height="500" viewBox="0 0 800 500">/)
    expect(svg).toContain('<rect width="800" height="500" fill="#fafafa"/>')
    expect(svg).toContain(`<image href="data:image/png;base64,${IMAGE}" width="800" height="500" preserveAspectRatio="none"/>`)
    expect(svg).not.toContain('<text')
    expect(svg.match(/<path /g)!.length).toBeGreaterThan(5)
  })

  it('places each element in its own box, rotated about its centre, and skips hidden ones', () => {
    const svg = svgOf(design([
      createElement('rect', { id: 'a', x: 10, y: 20, w: 100, h: 50 }, { rotation: 30, opacity: 0.5 }),
      createElement('rect', { id: 'b' }, { hidden: true, fill: '#ff0000' }),
    ]))
    expect(svg).toContain('<g transform="translate(10 20) rotate(30 50 25)" opacity="0.5"><rect x="0" y="0" width="100" height="50" rx="0" fill="#e5e7eb"/></g>')
    expect(svg).not.toContain('#ff0000')
  })

  it('draws borders inside the box, dashed when asked', () => {
    const svg = svgOf(design([createElement('rect', { id: 'a', w: 100, h: 50 }, { fill: null, stroke: '#000000', strokeWidth: 4, dashed: true, radius: 40 })]))
    expect(svg).toContain('<rect x="2" y="2" width="96" height="46" rx="23" fill="none" stroke="#000000" stroke-width="4" stroke-dasharray="12 8"/>')
  })

  it('draws fields only with values, marks only when chosen, and borders when asked', () => {
    const slip = design([
      createElement('number', { id: 'n', w: 120 }, { unit: 'kg', decimals: 1, border: true }),
      createElement('checkbox', { id: 'c' }, { mark: 'cross', color: '#123456' }),
      createElement('option', { id: 'o1' }, { group: 'g', color: '#aa0000' }),
      createElement('option', { id: 'o2' }, { group: 'g', color: '#00aa00' }),
      createElement('paid', { id: 'p' }, { value: 'unpaid', color: '#0000aa' }),
    ], { groups: [createGroup('g', { mark: 'dot' })] })
    const blank = svgOf(slip)
    expect(blank).not.toContain('<path')
    expect(blank).not.toMatch(/#123456|#aa0000|#00aa00|#0000aa/)
    expect(blank).toContain('stroke="#111827" stroke-width="2"')

    const filled = svgOf(slip, { ...empty, values: { n: 2.5, c: true, g: 'o2' }, order: { ...empty.order, paid: false } })
    expect(filled).toContain('clip-path="url(#clip-n)"')
    expect(filled).toContain('stroke="#123456"')
    expect(filled).toContain('<circle cx="20" cy="20" r="12" fill="#00aa00"/>')
    expect(filled).not.toContain('#aa0000')
    expect(filled).toContain('stroke="#0000aa"')
    // Paid: the unpaid spot is not marked.
    expect(svgOf(slip, { ...empty, order: { ...empty.order, paid: true } })).not.toContain('#0000aa')
  })

  it('shrinks a long value to fit its box, down to half its size, and clips the rest', () => {
    const narrow = createElement('textField', { id: 'tf', w: 60, h: 40 }, { size: 28 })
    const svg = svgOf(design([narrow]), { ...empty, values: { tf: 'Washing and ironing' } })
    const scales = [...svg.matchAll(/scale\(([\d.]+) /g)].map(match => Number(match[1]))
    // 28 px is a scale of 0.028 font units; half is 0.014.
    expect(Math.min(...scales)).toBeGreaterThanOrEqual(0.014)
    expect(Math.max(...scales)).toBeLessThan(0.028)
    expect(svg).toContain('<clipPath id="clip-tf"><rect width="60" height="40"/></clipPath>')
  })

  it('prefixes its own ids, so slips can share a page', () => {
    const svg = slipSvg({ design: design([createElement('orderNo', { id: 'no' })]), data: { ...empty, order: { ...empty.order, number: 7 } }, text, imageHref: () => undefined, idPrefix: 'thumb1-' })
    expect(svg).toContain('<clipPath id="thumb1-clip-no">')
  })

  it('escapes what it writes from the design', () => {
    expect(escapeXml('<a href="x">&\u0001</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;')
    const svg = svgOf(design([createElement('image', { id: 'i' }, { imageId: IMAGE })]), empty, () => 'x" onload="alert(1)')
    expect(svg).toContain('href="x&quot; onload=&quot;alert(1)"')
  })

  it('draws the shop\'s logo, kept in proportion, and nothing when the shop has none', () => {
    const slip = design([createElement('shopInfo', { id: 's' }, { info: 'logo' })])
    expect(svgOf(slip)).not.toContain('<image')
    expect(svgOf(slip, { ...empty, shop: { ...SAMPLE_SHOP, logoImageId: IMAGE } })).toContain('preserveAspectRatio="xMidYMid meet"')
    expect(imagesOf(slip, { logoImageId: IMAGE })).toEqual([IMAGE])
  })

  it('wraps text at spaces and new lines only, and sizes a text box to its lines', () => {
    const style = { size: 20, bold: false }
    expect(wrapLines('a b\nc', style, 1000, text)).toEqual(['a b', 'c'])
    expect(wrapLines('សូមអរគុណសម្រាប់ការប្រើប្រាស់', style, 10, text)).toEqual(['សូមអរគុណសម្រាប់ការប្រើប្រាស់'])
    expect(wrapLines('one two three', style, 40, text)).toEqual(['one', 'two', 'three'])
    expect(textHeight(createElement('text', { id: 't', w: 1000 }, { text: 'a\nb', size: 20, lineHeight: 1.5 }), text)).toBe(60)
  })
})

describe('fields', () => {
  it('lists the fields the owner fills in the fill order, then the missing ones in layer order', () => {
    const slip = design([
      createElement('orderNo', { id: 'no' }),
      createElement('number', { id: 'n1' }),
      createElement('option', { id: 'o1' }, { group: 'g' }),
      createElement('option', { id: 'o2' }, { group: 'g' }),
      createElement('paid', { id: 'p1' }),
      createElement('paid', { id: 'p2' }, { value: 'unpaid' }),
      createElement('amount', { id: 'a' }),
      createElement('text', { id: 't' }),
    ], { groups: [createGroup('g')], fillOrder: ['a', 'gone', 'g'] })
    expect(fillOrderOf(slip)).toEqual(['a', 'g', 'n1', 'paid'])
  })

  it('draws values as the slip shows them', () => {
    const data: SlipData = { values: { n: 2.5, t: 'Hi' }, order: { number: 1024, date: '2026-11-17', phone: '+85512345678', amount: 12000, paid: true }, shop: SAMPLE_SHOP }
    expect(valueText(createElement('number', { id: 'n' }, { decimals: 2, unit: 'kg' }), data)).toBe('2.5 kg')
    expect(valueText(createElement('textField', { id: 't' }), data)).toBe('Hi')
    expect(valueText(createElement('orderNo', { id: 'x' }), data)).toBe('1024')
    expect(valueText(createElement('date', { id: 'x' }), data)).toBe('17/11/2026')
    expect(valueText(createElement('phone', { id: 'x' }), data)).toBe('012 345 678')
    expect(valueText(createElement('amount', { id: 'x' }), data)).toBe('12,000៛')
    expect(valueText(createElement('amount', { id: 'x' }), { ...data, shop: { ...SAMPLE_SHOP, currency: 'USD' }, order: { ...data.order, amount: 450 } })).toBe('$4.50')
    expect(valueText(createElement('shopInfo', { id: 'x' }, { info: 'phone' }), data)).toBe('012 345 678')
  })

  it('makes sample values in each field\'s range', () => {
    const slip = design([
      createElement('number', { id: 'n' }, { min: 5, max: 9 }),
      createElement('textField', { id: 't' }, { maxLength: 3 }),
      createElement('option', { id: 'o1' }, { group: 'g' }),
      createElement('option', { id: 'o2' }, { group: 'g' }),
    ], { groups: [createGroup('g')] })
    expect(sampleData(slip, { date: '2026-11-17' }).values).toEqual({ n: 5, t: 'Sam', g: 'o1' })
  })
})
