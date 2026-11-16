import { describe, expect, it } from 'vitest'
import type { Order } from '#shared/contracts/orders'
import { fromBase64, imageInfo, toBase64 } from '#server/features/receipts/receipts.image'
import { orderValues } from '#server/features/receipts/receipts.values'

describe('imageInfo', () => {
  it('reads a JPEG\'s size from its frame header, past the segments before it', () => {
    const app0 = [0xFF, 0xE0, 0x00, 0x06, 0x4A, 0x46, 0x49, 0x46]
    const sof2 = [0xFF, 0xC2, 0x00, 0x0B, 0x08, 0x02, 0x58, 0x04, 0x38, 0x01, 0x01]
    expect(imageInfo(new Uint8Array([0xFF, 0xD8, ...app0, ...sof2, 0xFF, 0xD9]))).toEqual({ type: 'image/jpeg', width: 1080, height: 600 })
  })

  it('refuses what isn\'t a PNG or JPEG, or has no size before its data', () => {
    expect(imageInfo(new TextEncoder().encode('GIF89a......................'))).toBeNull()
    expect(imageInfo(new Uint8Array([0xFF, 0xD8, 0xFF, 0xDA, 0x00, 0x02, 0, 0, 0, 0, 0, 0]))).toBeNull()
    expect(imageInfo(new Uint8Array([0x89, 0x50, 0x4E, 0x47]))).toBeNull()
  })

  it('round-trips base64 for large files', () => {
    const bytes = new Uint8Array(200_000).map((_, i) => i % 251)
    expect(fromBase64(toBase64(bytes))).toEqual(bytes)
  })
})

describe('orderValues', () => {
  const line = (priceItemId: string | null, unit: 'piece' | 'kg', quantity: number) => ({ id: 'l', priceItemId, serviceNameEn: '', serviceNameKm: null, itemNameEn: '', itemNameKm: null, unit, quantity, unitPrice: 0, lineTotal: 0 })
  const order = {
    number: 61, createdAt: '2026-11-16T07:05:00.000Z', total: 13_500, currency: 'KHR', paymentStatus: 'unpaid', note: null,
    customer: { id: 'c', name: '', phone: null, anonymized: false },
    lines: [line('shirt', 'piece', 2), line('shirt', 'piece', 1), line('kg', 'kg', 2500), line(null, 'piece', 4)],
  } as unknown as Order
  const serviceOf = new Map([['shirt', 'wash'], ['kg', 'dry']])

  it('sums each item\'s quantity, writes kilograms, and lists the services the order uses', () => {
    const values = orderValues(order, { name: 'City Laundry', language: 'en', currency: 'KHR', status: 'active' }, serviceOf)
    expect(values.quantities).toEqual({ shirt: '3', kg: '2.5 kg' })
    expect(values.services).toEqual(['wash', 'dry'])
    expect(values.text).toMatchObject({ shopName: 'City Laundry', number: '61', customer: 'Walk-in', phone: '', total: '13,500៛', payment: 'Not paid', note: '' })
    expect(values.text.date).toBe('16 Nov 2026, 14:05')
    expect(values.paid).toBe(false)
  })

  it('writes in the shop\'s language: a phone when there\'s no name, Khmer words', () => {
    const withPhone = { ...order, paymentStatus: 'paid', customer: { ...order.customer, phone: '+85512345678' } } as Order
    const values = orderValues(withPhone, { name: 'ហាង', language: 'km', currency: 'KHR', status: 'active' }, serviceOf)
    expect(values.text).toMatchObject({ customer: '012 345 678', phone: '012 345 678', payment: 'បានបង់' })
    expect(values.quantities.kg).toBe('2.5 គ.ក')
    const former = orderValues({ ...withPhone, customer: { ...withPhone.customer, name: '', phone: null, anonymized: true } }, { name: 'ហាង', language: 'km', currency: 'KHR', status: 'active' }, serviceOf)
    expect(former.text).toMatchObject({ customer: 'អតិថិជនចាស់', phone: '' })
  })
})
