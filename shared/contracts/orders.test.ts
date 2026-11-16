import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { canRecordPayment, canTransition, createOrderSchema, isEditable, lineTotal, ORDER_ACTIONS, ORDER_STATUSES, orderTotal, updateOrderSchema } from './orders'

// The order rules shared by the server (which decides) and the app (which previews), spec §7.

describe('state machine', () => {
  it('allows exactly the spec\'s arrows', () => {
    const allowed = ORDER_STATUSES.flatMap(status => ORDER_ACTIONS.filter(action => canTransition(status, action)).map(action => `${status}:${action}`))
    expect(allowed.sort()).toEqual([
      'in_progress:cancel', 'in_progress:ready',
      'ready:cancel', 'ready:collect', 'ready:rework',
      'received:cancel', 'received:ready', 'received:start',
    ])
  })

  it('edits only before ready; payment at any status but cancelled, once', () => {
    expect(ORDER_STATUSES.filter(isEditable)).toEqual(['received', 'in_progress'])
    expect(ORDER_STATUSES.filter(status => canRecordPayment(status, 'unpaid'))).toEqual(['received', 'in_progress', 'ready', 'collected'])
    expect(canRecordPayment('received', 'paid')).toBe(false)
  })
})

describe('totals', () => {
  it('pieces × price; grams × price per kg, rounded half up to a whole minor unit', () => {
    expect(lineTotal('piece', 3, 2000)).toBe(6000)
    expect(lineTotal('kg', 2500, 3000)).toBe(7500)
    expect(lineTotal('kg', 1500, 333)).toBe(500)
    expect(lineTotal('kg', 1499, 333)).toBe(499)
    // USD cents: 750 g at $1.25/kg = 93.75 → 94 cents.
    expect(lineTotal('kg', 750, 125)).toBe(94)
    expect(orderTotal([{ lineTotal: 6000 }, { lineTotal: 7500 }])).toBe(13_500)
  })
})

describe('request schemas', () => {
  const id = '01900000-0000-7000-8000-000000000000'
  it('a new order needs a line; a total from the client is refused, never read', () => {
    expect(v.safeParse(createOrderSchema, { customerId: id, lines: [], note: '', paid: false }).success).toBe(false)
    expect(v.safeParse(createOrderSchema, { customerId: id, lines: [{ priceItemId: id, quantity: 1 }], note: '', paid: false, total: 1 }).success).toBe(false)
    expect(v.safeParse(createOrderSchema, { customerId: id, lines: [{ priceItemId: id, quantity: 1, unitPrice: 1 }], note: '', paid: false }).success).toBe(false)
  })

  it('an edit\'s line is either kept (lineId) or new (priceItemId); quantities are whole and positive', () => {
    const parse = (lines: unknown[]) => v.safeParse(updateOrderSchema, { version: 1, lines, note: '' }).success
    expect(parse([{ lineId: id, quantity: 2 }, { priceItemId: id, quantity: 2500 }])).toBe(true)
    expect(parse([{ lineId: id, priceItemId: id, quantity: 2 }])).toBe(false)
    expect(parse([{ lineId: id, quantity: 0 }])).toBe(false)
    expect(parse([{ lineId: id, quantity: 1.5 }])).toBe(false)
  })
})
