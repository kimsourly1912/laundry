import { describe, expect, it } from 'vitest'
import { blankDesign } from '#shared/contracts/slip-design'
import type { SlipDesign, SlipElement } from '#shared/contracts/slip-design'
import { fieldPlacement, publishProblems, usedPlaceholders } from '#shared/slip/checks'
import { createElement, createGroup } from '#shared/slip/elements'
import { checkFill, cleanValues } from '#shared/slip/values'

const label = 'អាវ'
function design(elements: SlipElement[], extra: Partial<SlipDesign> = {}): SlipDesign {
  return { ...blankDesign(800, 500), elements, ...extra }
}
const codes = (problems: { code: string, key?: string }[]) => problems.map(problem => problem.key ? `${problem.code}:${problem.key}` : problem.code)

describe('publishProblems (plan §5.6)', () => {
  it('passes a complete slip with no warnings', () => {
    const slip = design([
      createElement('orderNo', { id: 'no' }),
      createElement('number', { id: 'n' }, { label }),
      createElement('phone', { id: 'p' }),
      createElement('amount', { id: 'a' }),
    ])
    expect(publishProblems({ ...slip, paper: { widthMm: 80, heightMm: 52 } })).toEqual({ errors: [], warnings: [] })
  })

  it('refuses no Order No., a fixed field twice, a group of one option and a missing label', () => {
    const slip = design([
      createElement('date', { id: 'd1' }),
      createElement('date', { id: 'd2' }),
      createElement('paid', { id: 'p1' }),
      createElement('paid', { id: 'p2' }),
      createElement('number', { id: 'n' }, { label: ' ' }),
      createElement('option', { id: 'o' }, { group: 'g', label }),
    ], { groups: [createGroup('g', { label })] })
    // Paid spots start with their labels.
    expect(codes(publishProblems(slip).errors)).toEqual(['duplicateFixed:d2', 'duplicateFixed:p2', 'noOrderNo', 'groupTooSmall:g', 'missingLabel:n'])
  })

  it('warns about a field off the canvas, no amount, no phone and no fields', () => {
    const only = design([createElement('orderNo', { id: 'no', x: 790, y: 10, w: 40 })])
    expect(codes(publishProblems(only).warnings)).toEqual(['offCanvas:no', 'noAmount', 'noPhone', 'noFields', 'noPaperSize'])
    expect(codes(publishProblems({ ...only, paper: { widthMm: 80, heightMm: 52 } }).warnings)).not.toContain('noPaperSize')
    // Right on the edges: fine; one pixel over: off.
    expect(codes(publishProblems(design([createElement('number', { id: 'n', x: 0, y: 0, w: 800, h: 20 }, { label })])).warnings)).not.toContain('offCanvas:n')
    expect(codes(publishProblems(design([createElement('number', { id: 'n', x: -1, y: 0, w: 20, h: 20 }, { label })])).warnings)).toContain('offCanvas:n')
  })
})

describe('checkFill (plan §5.3)', () => {
  const slip = design([
    createElement('number', { id: 'n' }, { label, min: 0, max: 99, decimals: 1, required: true }),
    createElement('textField', { id: 't' }, { label, maxLength: 3 }),
    createElement('checkbox', { id: 'c' }, { label }),
    createElement('option', { id: 'o1' }, { group: 'g', label }),
    createElement('option', { id: 'o2' }, { group: 'g', label }),
    createElement('phone', { id: 'p' }, { required: true }),
    createElement('amount', { id: 'a' }),
  ], { groups: [createGroup('g', { label, required: true })] })
  const fill = { values: {}, phone: '', amount: null, paid: false }

  it('accepts values in range, and names each problem by key', () => {
    expect(checkFill(slip, { values: { n: 2.5, t: 'abc', c: true, g: 'o2' }, phone: '012 345 678', amount: 12000, paid: true })).toEqual({})
    expect(checkFill(slip, fill)).toEqual({ n: { code: 'required' }, g: { code: 'required' }, phone: { code: 'required' } })
    expect(checkFill(slip, { values: { n: 100, t: 'abcd', c: false, g: 'o3', x: 1 }, phone: '12', amount: -1, paid: false })).toEqual({
      n: { code: 'range', min: 0, max: 99 },
      t: { code: 'tooLong', max: 3 },
      c: { code: 'invalid' },
      g: { code: 'invalid' },
      x: { code: 'invalid' },
      amount: { code: 'invalid' },
    })
    expect(checkFill(slip, { ...fill, values: { n: 2.55, g: 'o1' }, phone: '012345678' })).toEqual({ n: { code: 'decimals', decimals: 1 } })
  })

  it('refuses a phone or an amount on a slip without that field', () => {
    const bare = design([createElement('number', { id: 'n' }, { label })])
    expect(checkFill(bare, { ...fill, phone: '012 345 678', amount: 5000 })).toEqual({ phone: { code: 'invalid' }, amount: { code: 'invalid' } })
    expect(checkFill(bare, { ...fill, phone: '  ' })).toEqual({})
  })

  it('stores only this design\'s keys, without empty text or unticked boxes', () => {
    expect(cleanValues(slip, { n: 2, t: '', c: false, g: 'o1', x: 'y' })).toEqual({ n: 2, g: 'o1' })
  })
})

describe('paper size (D39)', () => {
  it('takes 20–400 mm a side, and nothing else', async () => {
    const v = await import('valibot')
    const { designSchema } = await import('#shared/contracts/slip-design')
    const base = design([])
    expect(v.safeParse(designSchema, { ...base, paper: { widthMm: 80, heightMm: 52.5 } }).success).toBe(true)
    expect(v.safeParse(designSchema, base).success).toBe(true)
    expect(v.safeParse(designSchema, { ...base, paper: { widthMm: 10, heightMm: 52 } }).success).toBe(false)
    expect(v.safeParse(designSchema, { ...base, paper: { widthMm: 80, heightMm: 52, dpi: 300 } }).success).toBe(false)
  })
})

describe('an HTML slip\'s publish checks (D39)', () => {
  it('needs valid markup; the pickup number and the QR are warned about, never required (D45)', () => {
    const fields = [createElement('number', { id: 'n', x: -500, y: 0 }, { label })]
    const html = (markup: string) => ({ ...design(fields), paper: { widthMm: 80, heightMm: 52 }, html: markup })
    const complete = publishProblems(html('<div>{{order.number}} {{fields.n}} <div>{{order.qrCode}}</div></div>'))
    expect(complete.errors).toEqual([])
    expect(codes(complete.warnings)).not.toContain('noOrderNumber')
    expect(codes(complete.warnings)).not.toContain('noQrCode')
    const bare = publishProblems(html('<div>{{fields.n}}</div>'))
    expect(bare.errors).toEqual([])
    expect(codes(bare.warnings)).toEqual(expect.arrayContaining(['noOrderNumber', 'noQrCode']))
    // No markup at all is the one thing to fix; the slip's fields aren't called unplaced.
    const empty = publishProblems(html('  '))
    expect(codes(empty.errors)).toEqual(['htmlEmpty'])
    expect(codes(empty.warnings)).not.toContain('unplacedField:fields.n')
    expect(codes(publishProblems(html('<div>{{order.number}}{{order.qrCode}}<img></div>')).errors)).toEqual(['htmlInvalid'])
    expect(codes(publishProblems(html('<div>{{order.number}}{{order.qrCode}}</div>')).warnings)).not.toContain('offCanvas:n')
  })
})

describe('where an HTML slip prints each intake field (pilot plan §1)', () => {
  const shirt = createElement('number', { id: 'shirt_count' }, { label: 'Shirt' })
  const slip = (markup: string, elements: SlipElement[] = [shirt]) => ({ ...design(elements), paper: { widthMm: 80, heightMm: 52 }, html: `<div>{{order.number}}<div>{{order.qrCode}}</div>${markup}</div>` })

  it('is placed when its placeholder is in the markup, else not placed', () => {
    expect(fieldPlacement(shirt, usedPlaceholders(slip('<div>{{fields.shirt_count}}</div>')))).toBe('placed')
    expect(fieldPlacement(shirt, usedPlaceholders(slip('')))).toBe('unplaced')
    expect(fieldPlacement({ ...shirt, portalOnly: true }, usedPlaceholders(slip('')))).toBe('portalOnly')
    // Printed wins over a portal-only flag left behind.
    expect(fieldPlacement({ ...shirt, portalOnly: true }, usedPlaceholders(slip('<div>{{fields.shirt_count}}</div>')))).toBe('placed')
  })

  it('warns about an unplaced field in review, unless it\'s portal-only; it never blocks Publish', () => {
    expect(codes(publishProblems(slip('')).warnings)).toContain('unplacedField:fields.shirt_count')
    expect(publishProblems(slip('')).errors).toEqual([])
    expect(codes(publishProblems(slip('<div>{{fields.shirt_count}}</div>')).warnings)).not.toContain('unplacedField:fields.shirt_count')
    expect(codes(publishProblems(slip('', [{ ...shirt, portalOnly: true }])).warnings)).not.toContain('unplacedField:fields.shirt_count')
  })

  it('counts the phone and the total as placed by the order\'s own placeholders', () => {
    const phone = createElement('phone', { id: 'phone' })
    const total = createElement('amount', { id: 'total' })
    const used = usedPlaceholders(slip('<div>{{order.phone}} {{order.total}}</div>', [phone, total]))
    expect(fieldPlacement(phone, used)).toBe('placed')
    expect(fieldPlacement(total, used)).toBe('placed')
    expect(codes(publishProblems(slip('', [phone, total])).warnings)).toEqual(expect.arrayContaining(['unplacedField:order.phone', 'unplacedField:order.total']))
  })

  it('keeps the error for a required print binding, portal-only or not', () => {
    const required = { ...shirt, required: true, printRequired: true }
    expect(codes(publishProblems(slip('', [required])).errors)).toEqual(['missingPrintBinding:fields.shirt_count'])
    expect(codes(publishProblems(slip('', [{ ...required, portalOnly: true }])).errors)).toEqual(['missingPrintBinding:fields.shirt_count'])
    expect(codes(publishProblems(slip('', [required])).warnings)).not.toContain('unplacedField:fields.shirt_count')
  })
})
