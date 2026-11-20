import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { createShopSchema, updateShopSchema } from '#shared/contracts/platform-shops'
import { emptyNewShopForm, newShopFormSchema, shopDetailsFormSchema, slugFromName, toCreateShopRequest, toShopDetailsForm, toShopDetailsRequest } from '../schemas/shop-form'

const t = (key: string) => key
const form = { name: ' Sokha Laundry ', slug: 'Sokha-Laundry', owner: { name: 'Sokha', username: ' Sokha.Chan ', password: 'temporary pass 1' } }

describe('newShopFormSchema', () => {
  it('what it accepts, the server\'s contract accepts (docs/standards/forms.md: never looser)', () => {
    const parsed = v.parse(newShopFormSchema(t), form)
    expect(v.safeParse(createShopSchema, toCreateShopRequest(parsed)).success).toBe(true)
  })

  it.each([
    ['empty', emptyNewShopForm()],
    ['a short password', { ...form, owner: { ...form.owner, password: 'short' } }],
    ['a username with a space', { ...form, owner: { ...form.owner, username: 'sokha chan' } }],
    ['a short name with a double dash', { ...form, slug: 'sokha--laundry' }],
  ])('refuses %s, like the contract', (_case, input) => {
    expect(v.safeParse(newShopFormSchema(t), input).success).toBe(false)
    expect(v.safeParse(createShopSchema, input).success).toBe(false)
  })
})

describe('toCreateShopRequest', () => {
  it('sends the shop and its owner, a body the contract accepts', () => {
    expect(v.safeParse(createShopSchema, toCreateShopRequest(form)).success).toBe(true)
  })
})

describe('slugFromName', () => {
  it.each([
    ['Sokha Laundry', 'sokha-laundry'],
    ['  Café  Clean!! ', 'cafe-clean'],
    ['បោកអ៊ុត Dara', 'dara'],
    ['បោកអ៊ុត', ''],
  ])('%s → %s', (name, slug) => {
    expect(slugFromName(name)).toBe(slug)
  })
})

describe('shopDetailsFormSchema', () => {
  const saved = { name: 'Sokha Laundry', phone: null, address: 'St 271', currency: 'KHR' as const }

  it('opens the saved details (none as blank) and sends them back at the version opened', () => {
    const details = toShopDetailsForm(saved)
    expect(details).toMatchObject({ phone: '', address: 'St 271' })
    expect(v.parse(updateShopSchema, toShopDetailsRequest(details, 4))).toEqual({ version: 4, name: 'Sokha Laundry', phone: null, address: 'St 271', currency: 'KHR' })
  })

  it.each([
    ['no name', { name: ' ' }],
    ['letters in the phone', { phone: '012 abc' }],
    ['an address over 200 characters', { address: 'a'.repeat(201) }],
  ])('refuses %s, like the contract', (_case, change) => {
    const details = { ...toShopDetailsForm(saved), ...change }
    expect(v.safeParse(shopDetailsFormSchema(t), details).success).toBe(false)
    expect(v.safeParse(updateShopSchema, toShopDetailsRequest(details, 1)).success).toBe(false)
  })
})
