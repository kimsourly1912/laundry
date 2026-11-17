import { describe, expect, it } from 'vitest'
import { blankDesign } from '#shared/contracts/slip-design'
import type { SlipDesign, SlipElement } from '#shared/contracts/slip-design'
import { publishProblems } from '#shared/slip/checks'
import { createElement, createGroup } from '#shared/slip/elements'
import { checkFill, cleanValues } from '#shared/slip/values'

const label = { en: 'Shirt', km: 'អាវ' }
function design(elements: SlipElement[], extra: Partial<SlipDesign> = {}): SlipDesign {
  return { ...blankDesign(800, 500), elements, ...extra }
}
const codes = (problems: { code: string, key?: string }[]) => problems.map(problem => problem.key ? `${problem.code}:${problem.key}` : problem.code)

describe('publishProblems (plan §5.8)', () => {
  it('passes a complete slip with no warnings', () => {
    const slip = design([
      createElement('orderNo', { id: 'no' }),
      createElement('number', { id: 'n' }, { label }),
      createElement('phone', { id: 'p' }),
      createElement('amount', { id: 'a' }),
    ])
    expect(publishProblems(slip)).toEqual({ errors: [], warnings: [] })
  })

  it('refuses no Order No., a fixed field twice, a group of one option and a missing label', () => {
    const slip = design([
      createElement('date', { id: 'd1' }),
      createElement('date', { id: 'd2' }),
      createElement('paid', { id: 'p1' }),
      createElement('paid', { id: 'p2' }),
      createElement('number', { id: 'n' }, { label: { en: 'Shirt', km: ' ' } }),
      createElement('option', { id: 'o' }, { group: 'g', label }),
    ], { groups: [createGroup('g', { label })] })
    // Paid spots start with their labels in both languages.
    expect(codes(publishProblems(slip).errors)).toEqual(['duplicateFixed:d2', 'duplicateFixed:p2', 'noOrderNo', 'groupTooSmall:g', 'missingLabel:n'])
  })

  it('warns about a field off the canvas, no amount, no phone and no fields', () => {
    const only = design([createElement('orderNo', { id: 'no', x: 790, y: 10, w: 40 })])
    expect(codes(publishProblems(only).warnings)).toEqual(['offCanvas:no', 'noAmount', 'noPhone', 'noFields'])
    // Rotated inside the canvas: fine; rotated across its edge: off.
    const rotated = design([createElement('number', { id: 'n', x: 0, y: 0, w: 100, h: 20 }, { label, rotation: 90 })])
    expect(codes(publishProblems(rotated).warnings)).toContain('offCanvas:n')
  })
})

describe('checkFill (plan §5.4)', () => {
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
      phone: { code: 'invalidPhone' },
      amount: { code: 'invalid' },
    })
    expect(checkFill(slip, { ...fill, values: { n: 2.55, g: 'o1' }, phone: '012345678' })).toEqual({ n: { code: 'decimals', decimals: 1 } })
  })

  it('stores only this design\'s keys, without empty text or unticked boxes', () => {
    expect(cleanValues(slip, { n: 2, t: '', c: false, g: 'o1', x: 'y' })).toEqual({ n: 2, g: 'o1' })
  })
})
