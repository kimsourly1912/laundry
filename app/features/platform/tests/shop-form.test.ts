import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { createShopSchema } from '#shared/contracts/platform-shops'
import { emptyNewShopForm, newShopFormSchema, slugFromName, toCreateShopRequest } from '../schemas/shop-form'

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
