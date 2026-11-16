import { describe, expect, it } from 'vitest'
import { keepsLines, quantityError } from '#server/features/orders/orders.rules'
import { startOfShopDay } from '#server/utils/time'

describe('keepsLines', () => {
  const before = [{ id: 'a', quantity: 3 }, { id: 'b', quantity: 2500 }]
  it('true only for the same lines, order and quantities', () => {
    expect(keepsLines(before, [{ lineId: 'a', quantity: 3 }, { lineId: 'b', quantity: 2500 }])).toBe(true)
    expect(keepsLines(before, [{ lineId: 'b', quantity: 2500 }, { lineId: 'a', quantity: 3 }])).toBe(false)
    expect(keepsLines(before, [{ lineId: 'a', quantity: 3 }])).toBe(false)
    expect(keepsLines(before, [{ lineId: 'a', quantity: 4 }, { lineId: 'b', quantity: 2500 }])).toBe(false)
    expect(keepsLines(before, [{ lineId: 'a', quantity: 3 }, { priceItemId: 'b', quantity: 2500 }])).toBe(false)
  })
})

describe('quantityError', () => {
  it('pieces stop at 9,999; grams don\'t', () => {
    expect(quantityError('piece', 9999)).toBeUndefined()
    expect(quantityError('piece', 10_000)).toBe('At most 9999 pieces')
    expect(quantityError('kg', 10_000)).toBeUndefined()
  })
})

describe('startOfShopDay', () => {
  it('is midnight in Phnom Penh (UTC+7), as a UTC instant', () => {
    expect(startOfShopDay(new Date('2026-11-16T01:00:00Z')).toISOString()).toBe('2026-11-15T17:00:00.000Z')
    expect(startOfShopDay(new Date('2026-11-15T17:00:00Z')).toISOString()).toBe('2026-11-15T17:00:00.000Z')
    expect(startOfShopDay(new Date('2026-11-15T16:59:59Z')).toISOString()).toBe('2026-11-14T17:00:00.000Z')
  })
})
