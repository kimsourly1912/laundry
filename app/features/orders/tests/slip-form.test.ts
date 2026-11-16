import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { createOrderSchema } from '#shared/contracts/orders'
import type { OrderCustomer } from '#shared/contracts/orders'
import { customerLabel, emptySlip, filledCount, slipErrors, slipTotal, stepPieces, toSlipRequest } from '../schemas/slip-form'

const t = (key: string) => key
const shirt = { id: '01900000-0000-7000-8000-000000000001', unit: 'piece' as const, price: 2000 }
const kg = { id: '01900000-0000-7000-8000-000000000002', unit: 'kg' as const, price: 3000 }
const coat = { id: '01900000-0000-7000-8000-000000000003', unit: 'piece' as const, price: 5000 }
const items = [shirt, kg, coat]

describe('the paper-slip form', () => {
  it('turns filled boxes into lines in price list order, and the request passes the contract', () => {
    const form = { ...emptySlip(), phone: ' 012 345 678 ', name: ' Dara ', quantities: { [kg.id]: '2,5', [shirt.id]: '3', [coat.id]: ' ' } }
    expect(slipErrors(form, items, t)).toEqual([])
    expect(slipTotal(form, items)).toBe(3 * 2000 + 7500)
    const request = toSlipRequest(form, items)
    expect(request.lines).toEqual([{ priceItemId: shirt.id, quantity: 3 }, { priceItemId: kg.id, quantity: 2500 }])
    const parsed = v.parse(createOrderSchema, request)
    expect(parsed.customer).toEqual({ kind: 'counter', phone: '+85512345678', name: 'Dara' })
  })

  it('a walk-in: no phone, no name, still a valid request', () => {
    const form = { ...emptySlip(), quantities: { [shirt.id]: '1' } }
    expect(v.parse(createOrderSchema, toSlipRequest(form, items)).customer).toEqual({ kind: 'counter', phone: null, name: '' })
  })

  it('asks for at least one item, a valid phone, and valid quantities on their boxes', () => {
    expect(slipErrors(emptySlip(), items, t)).toEqual([{ name: 'quantities', message: 'orders.slip.nothing' }])
    const form = { ...emptySlip(), phone: '12', quantities: { [shirt.id]: '1.5', [kg.id]: 'abc' } }
    expect(slipErrors(form, items, t).map(error => error.name)).toEqual(['phone', `quantities.${shirt.id}`, `quantities.${kg.id}`])
    // What the form refuses, the contract refuses too (never looser).
    expect(v.safeParse(createOrderSchema, toSlipRequest({ ...emptySlip(), phone: '12', quantities: { [shirt.id]: '1' } }, items)).success).toBe(false)
  })

  it('steps pieces up and down, never below none', () => {
    expect(stepPieces(undefined, 1)).toBe('1')
    expect(stepPieces('2', 1)).toBe('3')
    expect(stepPieces('1', -1)).toBe('')
    expect(stepPieces('', -1)).toBe('')
    expect(stepPieces('abc', 1)).toBe('1')
  })

  it('counts the boxes filled in a tab', () => {
    expect(filledCount({ ...emptySlip(), quantities: { [shirt.id]: '2', [kg.id]: '' } }, [shirt.id, kg.id, coat.id])).toBe(1)
  })
})

describe('customerLabel', () => {
  const base: OrderCustomer = { id: 'x', name: '', phone: null, anonymized: false }
  it('shows the name, else the phone, else Walk-in; a former customer as such', () => {
    expect(customerLabel({ ...base, name: 'Dara', phone: '+85512345678' }, t)).toBe('Dara')
    expect(customerLabel({ ...base, phone: '+85512345678' }, t)).toBe('012 345 678')
    expect(customerLabel(base, t)).toBe('orders.walkIn')
    expect(customerLabel({ ...base, anonymized: true }, t)).toBe('customers.former')
  })
})
