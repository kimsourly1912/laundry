import { describe, expect, it } from 'vitest'
import { blankDesign } from '#shared/contracts/slip-design'
import { createElement, createGroup } from '#shared/slip/elements'
import { SAMPLE_SHOP } from '#shared/slip/fields'
import { emptyFill, fillData, fillSteps, problemKey, stepOf } from '../utils/fill'

describe('fillSteps', () => {
  const design = {
    ...blankDesign(800, 500),
    elements: [
      createElement('orderNo', { id: 'no' }),
      createElement('number', { id: 'n' }),
      createElement('option', { id: 'o1' }, { group: 'g' }),
      createElement('option', { id: 'o2' }, { group: 'g' }),
      createElement('phone', { id: 'p' }),
      createElement('paid', { id: 'pd' }),
      createElement('paid', { id: 'up' }, { value: 'unpaid' }),
    ],
    groups: [createGroup('g')],
    fillOrder: ['p', 'g'],
  }

  it('goes through the fill order, then the rest; never Order No.', () => {
    const steps = fillSteps(design)
    expect(steps.map(step => `${step.kind}:${step.key}`)).toEqual(['phone:p', 'choice:g', 'number:n', 'paid:paid'])
    expect(steps.map(problemKey)).toEqual(['phone', 'g', 'n', 'paid'])
    expect(stepOf(steps, design.elements[3]!)).toBe(1)
    expect(stepOf(steps, design.elements[6]!)).toBe(3)
    expect(stepOf(steps, design.elements[0]!)).toBe(-1)
  })

  it('draws the phone as E.164 once it\'s valid', () => {
    const data = fillData({ ...emptyFill(), phone: '012 345 678', amount: 500 }, { shop: SAMPLE_SHOP, date: '2026-11-17' })
    expect(data.order).toEqual({ number: null, date: '2026-11-17', phone: '+85512345678', amount: 500, paid: false })
    expect(fillData({ ...emptyFill(), phone: '01' }, { shop: SAMPLE_SHOP, date: null }).order.phone).toBeNull()
  })
})
