import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import type { ShopSettings } from '#shared/contracts/shop-settings'
import { updateShopSettingsSchema } from '#shared/contracts/shop-settings'
import { settingsFormSchema, toSettingsForm, toSettingsRequest } from '../schemas/settings-form'

const t = (key: string) => key
const saved: ShopSettings = { name: 'Sokha Laundry', phone: null, address: 'St 271', currency: 'KHR', version: 4 }

describe('settings form', () => {
  it('opens saved settings (none as blank) and sends them back at the version opened', () => {
    const form = toSettingsForm(saved)
    expect(form).toMatchObject({ phone: '', address: 'St 271' })
    const request = v.parse(updateShopSettingsSchema, toSettingsRequest(form, saved.version))
    expect(request).toEqual({ version: 4, name: 'Sokha Laundry', phone: null, address: 'St 271', currency: 'KHR' })
  })

  it.each([
    ['no name', { name: ' ' }],
    ['letters in the phone', { phone: '012 abc' }],
    ['an address over 200 characters', { address: 'a'.repeat(201) }],
  ])('refuses %s, like the contract', (_case, change) => {
    const form = { ...toSettingsForm(saved), ...change }
    expect(v.safeParse(settingsFormSchema(t), form).success).toBe(false)
    expect(v.safeParse(updateShopSettingsSchema, toSettingsRequest(form, 1)).success).toBe(false)
  })
})
