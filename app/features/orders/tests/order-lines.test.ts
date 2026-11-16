import { describe, expect, it } from 'vitest'
import type { DraftLine } from '../schemas/order-lines'
import { draftFromLine, formatQuantity, lineErrors, parseQuantity, previewTotal, toCreateLines, toUpdateLines } from '../schemas/order-lines'

const draft = (extra: Partial<DraftLine>): DraftLine => ({ key: 'k', serviceNameEn: 'Wash', serviceNameKm: null, itemNameEn: 'Shirt', itemNameKm: null, unit: 'piece', unitPrice: 2000, quantity: '1', ...extra })
const t = (key: string) => key

describe('quantities', () => {
  it('pieces are whole numbers from 1 to 9,999', () => {
    expect(parseQuantity('piece', '3')).toBe(3)
    expect([' 0', '1.5', '10000', 'two', ''].map(text => parseQuantity('piece', text))).toEqual([null, null, null, null, null])
  })

  it('kilograms become grams, up to 3 decimals; a comma is a decimal point', () => {
    expect(parseQuantity('kg', '2.5')).toBe(2500)
    expect(parseQuantity('kg', '2,25')).toBe(2250)
    expect(parseQuantity('kg', '0.001')).toBe(1)
    expect(['0', '1.2345', '', 'kg'].map(text => parseQuantity('kg', text))).toEqual([null, null, null, null])
  })

  it('shows grams as kilograms without trailing zeros', () => {
    expect([2500, 2000, 1, 1250].map(grams => formatQuantity('kg', grams))).toEqual(['2.5', '2', '0.001', '1.25'])
    expect(formatQuantity('piece', 3)).toBe('3')
  })
})

describe('preview and requests', () => {
  const lines = [draft({ quantity: '3' }), draft({ unit: 'kg', unitPrice: 3000, quantity: '2.5', priceItemId: 'kg-item' }), draft({ quantity: 'x' })]

  it('previews the valid lines\' total the way the server computes it', () => {
    expect(previewTotal(lines)).toBe(6000 + 7500)
  })

  it('names each invalid quantity; no lines at all is an error too', () => {
    expect(lineErrors(lines, t)).toEqual([{ name: 'lines.2.quantity', message: 'orders.lines.invalidPieces' }])
    expect(lineErrors([], t)).toEqual([{ name: 'lines', message: 'orders.lines.required' }])
  })

  it('a kept line goes back by its id, a new one by its price item', () => {
    const kept = draftFromLine({ id: 'line-1', priceItemId: 'p', serviceNameEn: 'Wash', serviceNameKm: null, itemNameEn: 'Mixed', itemNameKm: null, unit: 'kg', quantity: 2500, unitPrice: 3000, lineTotal: 7500 })
    expect(kept.quantity).toBe('2.5')
    expect(toUpdateLines([kept, draft({ priceItemId: 'shirt', quantity: '2' })])).toEqual([{ lineId: 'line-1', quantity: 2500 }, { priceItemId: 'shirt', quantity: 2 }])
    expect(toCreateLines([draft({ priceItemId: 'shirt', quantity: '2' })])).toEqual([{ priceItemId: 'shirt', quantity: 2 }])
  })
})
