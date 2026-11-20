import { describe, expect, it } from 'vitest'
import { parseOrderSearch } from '#server/features/orders/orders.rules'

describe('parseOrderSearch (plan §3: by order number or phone)', () => {
  it('reads a phone as typed in Cambodia, a number with or without #, and nothing else', () => {
    expect(parseOrderSearch('012 345 678')).toEqual({ phone: '+85512345678' })
    expect(parseOrderSearch('+855 12 345 678')).toEqual({ phone: '+85512345678' })
    expect(parseOrderSearch('12')).toEqual({ number: 12 })
    expect(parseOrderSearch('#2139')).toEqual({ number: 2139 })
    expect(parseOrderSearch('0')).toEqual({ none: true })
    expect(parseOrderSearch('Dara')).toEqual({ none: true })
    expect(parseOrderSearch('1234567890123')).toEqual({ none: true })
  })
})
