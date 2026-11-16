import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { customerInputSchema } from '#shared/contracts/customers'
import { formatPhone, toE164 } from '#shared/contracts/phone'
import { customerFormSchema, toCustomerForm, toCustomerRequest } from '../schemas/customer-form'

const t = (key: string) => key

describe('phone numbers (shared/contracts/phone.ts)', () => {
  it.each([
    ['012 345 678', '+85512345678'],
    ['012345678', '+85512345678'],
    ['+855 12 345 678', '+85512345678'],
    ['855 12345678', '+85512345678'],
    ['097 777 7777', '+855977777777'],
    ['+66 81 234 5678', '+66812345678'],
    ['12', null],
    ['abc', null],
  ])('%s → %s', (typed, e164) => {
    expect(toE164(typed)).toBe(e164)
  })

  it('shows Cambodian numbers the national way, others internationally', () => {
    expect(formatPhone('+85512345678')).toBe('012 345 678')
    expect(formatPhone('+66812345678')).toBe('+66 81 234 5678')
  })
})

describe('customer form', () => {
  it('a valid form makes a request the contract accepts, with the phone in E.164 and blanks as none', () => {
    const form = { name: ' Sokha ', phone: '012 345 678', note: '' }
    expect(v.safeParse(customerFormSchema(t), form).success).toBe(true)
    expect(v.parse(customerInputSchema, toCustomerRequest(form))).toEqual({ name: 'Sokha', phone: '+85512345678', note: null })
    expect(v.parse(customerInputSchema, toCustomerRequest({ name: 'Dara', phone: '  ', note: '' })).phone).toBeNull()
  })

  it.each([
    ['no name', { name: ' ', phone: '', note: '' }],
    ['an invalid phone', { name: 'Sokha', phone: '12', note: '' }],
  ])('refuses %s, like the contract', (_case, form) => {
    expect(v.safeParse(customerFormSchema(t), form).success).toBe(false)
    expect(v.safeParse(customerInputSchema, toCustomerRequest(form)).success).toBe(false)
  })

  it('opens a customer with the phone as people write it', () => {
    expect(toCustomerForm({ id: 'c', name: 'Sokha', phone: '+85512345678', note: null, anonymized: false, createdAt: '', version: 1 })).toEqual({ name: 'Sokha', phone: '012 345 678', note: '' })
  })
})
