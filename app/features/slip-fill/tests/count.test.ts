import { describe, expect, it } from 'vitest'
import { parseCount, stepCount } from '../utils/count'

describe('stepCount and parseCount (sheet 01 steppers)', () => {
  it('+ on an empty box gives 1; − on the lowest count empties it; the range holds', () => {
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

  it('reads a typed count', () => {
    expect(parseCount('')).toBeUndefined()
    expect(parseCount(' 2 ')).toBe(2)
    expect(parseCount('2,5')).toBe(2.5)
    expect(parseCount('two')).toBeNaN()
  })
})
