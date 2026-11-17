import { describe, expect, it } from 'vitest'
import { formatMoney, moneyInput, parseMoney } from '~/utils/format'

// Money (spec T12, docs/standards/i18n.md → Money): integer minor units, riel without decimals.

describe('formatMoney', () => {
  it('riel without decimals, dollars with cents, the same in both languages', () => {
    expect(formatMoney(13500, 'KHR')).toBe('13,500៛')
    expect(formatMoney(1250, 'USD')).toBe('$12.50')
    expect(formatMoney(1234567, 'USD')).toBe('$12,345.67')
    expect(formatMoney(0, 'KHR')).toBe('0៛')
  })
})

describe('parseMoney', () => {
  it.each([
    ['13500', 'KHR', 13500],
    ['13,500', 'KHR', 13500],
    [' 2 000 ', 'KHR', 2000],
    ['13500.5', 'KHR', null],
    ['12.50', 'USD', 1250],
    ['12.5', 'USD', 1250],
    ['12', 'USD', 1200],
    ['0.05', 'USD', 5],
    ['12.505', 'USD', null],
    ['-5', 'KHR', null],
    ['abc', 'USD', null],
    ['', 'KHR', null],
  ] as const)('%j in %s → %j', (text, currency, minor) => {
    expect(parseMoney(text, currency)).toBe(minor)
  })

  it('round-trips with moneyInput', () => {
    for (const [minor, currency] of [[13500, 'KHR'], [1250, 'USD'], [5, 'USD'], [0, 'KHR']] as const) {
      expect(parseMoney(moneyInput(minor, currency), currency)).toBe(minor)
    }
  })
})
