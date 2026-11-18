import { describe, expect, it } from 'vitest'
import type { OrderTemplate } from '#shared/contracts/orders'
import { blankDesign } from '#shared/contracts/slip-design'
import type { SlipDesign } from '#shared/contracts/slip-design'
import { createElement } from '#shared/slip/elements'
import { carryFill, serverProblems, startingTemplate, toCreateRequest } from '../utils/order-form'

const label = 'Box'
const design = (elements: SlipDesign['elements']): SlipDesign => ({ ...blankDesign(400, 300), elements })
const template = (templateId: string, isDefault = false): OrderTemplate => ({ templateId, name: templateId, isDefault, versionId: `${templateId}-v1`, versionNumber: 1, design: design([]) })

describe('startingTemplate (plan §4)', () => {
  it('takes the one asked for, else the default, else the only one; else the owner chooses', () => {
    const list = [template('a'), template('b', true)]
    expect(startingTemplate(list, 'a')?.templateId).toBe('a')
    expect(startingTemplate(list, 'gone')?.templateId).toBe('b')
    expect(startingTemplate([template('a')])?.templateId).toBe('a')
    expect(startingTemplate([template('a'), template('b')])).toBeUndefined()
    expect(startingTemplate([])).toBeUndefined()
  })
})

describe('carryFill', () => {
  it('keeps only what the other design has fields for', () => {
    const next = design([createElement('number', { id: 'shirt' }, { label }), createElement('amount', { id: 'a' })])
    expect(carryFill({ values: { shirt: 2, pants: 1 }, phone: '012 345 678', amount: 7000, paid: true }, next))
      .toEqual({ values: { shirt: 2 }, phone: '', amount: 7000, paid: true })
  })
})

describe('toCreateRequest', () => {
  it('sends the version filled and the values, trimmed and without empty ones', () => {
    const filled = { ...template('a'), design: design([createElement('number', { id: 'shirt' }, { label }), createElement('textField', { id: 'name' }, { label })]) }
    expect(toCreateRequest({ values: { shirt: 2, name: '' }, phone: ' 012 345 678 ', amount: 7000, paid: false }, filled))
      .toEqual({ templateVersionId: 'a-v1', values: { shirt: 2 }, phone: '012 345 678', amount: 7000, paid: false })
  })
})

describe('serverProblems', () => {
  it('maps the server\'s paths to the form\'s keys', () => {
    expect(serverProblems({ 'values.shirt': ['From 0 to 999'], 'phone': ['Not a valid phone number'] })).toEqual({ shirt: 'From 0 to 999', phone: 'Not a valid phone number' })
    expect(serverProblems(undefined)).toEqual({})
  })
})

describe('shopToday', () => {
  it('is Phnom Penh\'s day (UTC+7)', async () => {
    const { shopToday } = await import('../utils/order-form')
    expect(shopToday(new Date('2026-11-18T16:59:00Z'))).toBe('2026-11-18')
    expect(shopToday(new Date('2026-11-18T17:00:00Z'))).toBe('2026-11-19')
  })
})

describe('stepCount and parseCount (sheet 01 steppers)', () => {
  it('+ on an empty box gives 1; − on the lowest count empties it; the range holds', async () => {
    const { stepCount } = await import('../utils/order-form')
    const range = { min: 0, max: 3 }
    expect(stepCount(undefined, 1, range)).toBe(1)
    expect(stepCount(undefined, -1, range)).toBeUndefined()
    expect(stepCount(1, 1, range)).toBe(2)
    expect(stepCount(3, 1, range)).toBe(3)
    expect(stepCount(1, -1, range)).toBeUndefined()
    expect(stepCount(2.5, -1, range)).toBe(1.5)
    expect(stepCount(undefined, 1, { min: 5, max: 9 })).toBe(5)
    expect(stepCount(5, -1, { min: 5, max: 9 })).toBeUndefined()
  })

  it('reads a typed count', async () => {
    const { parseCount } = await import('../utils/order-form')
    expect(parseCount('')).toBeUndefined()
    expect(parseCount(' 2 ')).toBe(2)
    expect(parseCount('2,5')).toBe(2.5)
    expect(parseCount('two')).toBeNaN()
  })
})
