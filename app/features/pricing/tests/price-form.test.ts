import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { PRICE_MAX, priceItemInputSchema, serviceTypeInputSchema } from '#shared/contracts/pricing'
import { priceItemFormSchema, serviceTypeFormSchema, toPriceItemForm, toPriceItemRequest, toServiceTypeRequest } from '../schemas/price-form'

const t = (key: string) => key
const TYPE = '01900000-0000-7000-8000-000000000001'

describe('priceItemFormSchema', () => {
  const form = { serviceTypeId: TYPE, nameEn: 'Shirt', nameKm: 'អាវ', unit: 'piece' as const, price: '2,000' }

  it('a valid form makes a request the contract accepts, with the price in minor units', () => {
    expect(v.safeParse(priceItemFormSchema(t, 'KHR'), form).success).toBe(true)
    const request = toPriceItemRequest(form, 'KHR')
    expect(request.price).toBe(2000)
    expect(v.safeParse(priceItemInputSchema, request).success).toBe(true)
    expect(toPriceItemRequest({ ...form, price: '1.25' }, 'USD').price).toBe(125)
  })

  it.each([
    ['riel with decimals', 'KHR', { price: '2000.5' }],
    ['three decimals of a dollar', 'USD', { price: '1.255' }],
    ['above the contract\'s maximum', 'KHR', { price: String(PRICE_MAX + 1) }],
    ['no price', 'KHR', { price: '' }],
    ['no English name', 'KHR', { nameEn: ' ' }],
    ['no service type', 'KHR', { serviceTypeId: '' }],
  ] as const)('refuses %s', (_case, currency, change) => {
    expect(v.safeParse(priceItemFormSchema(t, currency), { ...form, ...change }).success).toBe(false)
  })

  it('opens an item in the shop\'s currency', () => {
    const item = { id: 'i', serviceTypeId: TYPE, nameEn: 'Shirt', nameKm: null, unit: 'kg' as const, price: 450, sort: 1, status: 'active' as const, version: 3 }
    expect(toPriceItemForm(item, 'USD')).toEqual({ serviceTypeId: TYPE, nameEn: 'Shirt', nameKm: '', unit: 'kg', price: '4.50' })
    expect(toPriceItemForm(undefined, 'KHR')).toMatchObject({ unit: 'piece', price: '' })
  })
})

describe('serviceTypeFormSchema', () => {
  it('a valid form makes a request the contract accepts; Khmer optional', () => {
    const form = { nameEn: 'Wash & iron', nameKm: '' }
    expect(v.safeParse(serviceTypeFormSchema(t), form).success).toBe(true)
    expect(v.parse(serviceTypeInputSchema, toServiceTypeRequest(form))).toEqual({ nameEn: 'Wash & iron', nameKm: null })
    expect(v.safeParse(serviceTypeFormSchema(t), { nameEn: '', nameKm: 'បោក' }).success).toBe(false)
  })
})
