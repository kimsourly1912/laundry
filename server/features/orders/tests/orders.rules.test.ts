import { describe, expect, it } from 'vitest'
import { parseOrderSearch, priceLines } from '#server/features/orders/orders.rules'

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

describe('priceLines (D39: per piece, per kg in whole grams, halves up)', () => {
  const prices = new Map([
    ['shirt', { id: 'p1', label: 'Shirt, wash + iron', unit: 'piece' as const, price: 2000 }],
    ['pants', { id: 'p2', label: 'Pants', unit: 'piece' as const, price: 3000 }],
    ['wash', { id: 'p3', label: 'Wash by weight', unit: 'kg' as const, price: 3000 }],
    ['odd', { id: 'p4', label: 'Odd', unit: 'kg' as const, price: 1 }],
  ])

  it('prices the product notes\' examples: 2 shirts and 1 pants = 7,000; 2.50 kg at 3,000 = 7,500', () => {
    const { lines, total, problems } = priceLines([{ fieldId: 's', key: 'shirt', value: 2 }, { fieldId: 'p', key: 'pants', value: 1 }], prices)
    expect(total).toBe(7000)
    expect(problems).toEqual({})
    expect(lines.map(line => [line.label, line.quantity, line.unitPrice, line.lineTotal])).toEqual([['Shirt, wash + iron', 2, 2000, 4000], ['Pants', 1, 3000, 3000]])
    const weight = priceLines([{ fieldId: 'w', key: 'wash', value: 2.5 }], prices)
    expect(weight.lines[0]).toMatchObject({ unit: 'kg', quantity: 2500, lineTotal: 7500 })
  })

  it('rounds a weighted line to the nearest minor unit, halves up; skips empty and zero', () => {
    expect(priceLines([{ fieldId: 'a', key: 'odd', value: 0.5 }], prices).total).toBe(1)
    expect(priceLines([{ fieldId: 'a', key: 'odd', value: 0.4 }], prices).total).toBe(0)
    expect(priceLines([{ fieldId: 'a', key: 'shirt', value: 0 }], prices).lines).toEqual([])
  })

  it('names the field of a key with no price, or part of a piece', () => {
    expect(priceLines([{ fieldId: 'a', key: 'coat', value: 1 }, { fieldId: 'b', key: 'shirt', value: 1.5 }], prices).problems).toEqual({ a: 'noPrice', b: 'wholePieces' })
  })
})
