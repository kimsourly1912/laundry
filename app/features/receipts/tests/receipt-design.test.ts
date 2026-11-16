import { describe, expect, it } from 'vitest'
import type { ReceiptField } from '#shared/contracts/receipts'
import { clampPoint, designValues, fieldChoices, fieldLabel, newField } from '../schemas/receipt-design'

const t = (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key)
const names = {
  types: [{ id: 'wash', nameEn: 'Wash & iron', nameKm: 'បោកអ៊ុត' }],
  items: [{ id: 'shirt', serviceTypeId: 'wash', nameEn: 'Shirt', nameKm: 'អាវ' }],
}
const canvas = { width: 1200, height: 720 }

describe('newField', () => {
  it('starts in the middle, sized to the canvas, with a key no other field has', () => {
    const existing: ReceiptField[] = [{ kind: 'check', id: 'f2', x: 0, y: 0, size: 20, color: '#000000', when: 'paid' }]
    expect(newField({ kind: 'text', source: 'total' }, canvas, existing)).toEqual({ kind: 'text', source: 'total', id: 'f3', x: 600, y: 360, size: 30, color: '#111111', align: 'start', bold: false })
    expect(newField({ kind: 'check', when: 'unpaid' }, canvas, [])).toEqual({ kind: 'check', when: 'unpaid', id: 'f1', x: 600, y: 360, size: 36, color: '#111111' })
  })

  it('keeps text readable on a small canvas', () => {
    expect(newField({ kind: 'quantity', priceItemId: 'shirt' }, { width: 200, height: 200 }, []).size).toBe(12)
  })
})

describe('clampPoint', () => {
  it('keeps a dragged field inside the canvas, in whole pixels', () => {
    expect(clampPoint({ x: -5.4, y: 900 }, canvas)).toEqual({ x: 0, y: 720 })
    expect(clampPoint({ x: 10.6, y: 20.2 }, canvas)).toEqual({ x: 11, y: 20 })
  })
})

describe('fieldChoices and fieldLabel', () => {
  it('offers the order\'s details, the two ticks, each service\'s tick and each item\'s quantity', () => {
    const labels = fieldChoices(names).map(choice => fieldLabel(choice, names, t, 'en'))
    expect(labels.slice(0, 2)).toEqual(['receipts.sources.shopName', 'receipts.sources.number'])
    expect(labels.slice(-4)).toEqual(['receipts.paidTick', 'receipts.unpaidTick', 'receipts.serviceTick {"service":"Wash & iron"}', 'Shirt · Wash & iron'])
  })

  it('names in the screen\'s language, and says when an entry is gone', () => {
    expect(fieldLabel({ kind: 'quantity', priceItemId: 'shirt' }, names, t, 'km')).toBe('អាវ · បោកអ៊ុត')
    expect(fieldLabel({ kind: 'quantity', priceItemId: 'gone' }, names, t, 'en')).toBe('receipts.removedEntry')
    expect(fieldLabel({ kind: 'serviceCheck', serviceTypeId: 'gone' }, names, t, 'en')).toBe('receipts.serviceTick {"service":"receipts.removedEntry"}')
  })
})

describe('designValues', () => {
  it('fills every placed quantity and service, paid', () => {
    const fields: ReceiptField[] = [
      { kind: 'quantity', id: 'a', x: 0, y: 0, size: 20, color: '#000000', align: 'start', bold: false, priceItemId: 'shirt' },
      { kind: 'serviceCheck', id: 'b', x: 0, y: 0, size: 20, color: '#000000', serviceTypeId: 'wash' },
    ]
    const values = designValues({ shopName: 'City', total: '13,500៛', date: 'today', fields, t })
    expect(values).toMatchObject({ quantities: { shirt: '2' }, services: ['wash'], paid: true })
    expect(values.text).toMatchObject({ shopName: 'City', number: '61', total: '13,500៛', customer: 'receipts.sample.customer' })
  })
})
