import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import type { ShopSettings } from '#shared/contracts/shop-settings'
import { updateShopSettingsSchema } from '#shared/contracts/shop-settings'
import { settingsFormSchema, toSettingsForm, toSettingsRequest } from '../schemas/settings-form'

const t = (key: string) => key
const saved: ShopSettings = { name: 'Sokha Laundry', phone: null, address: 'St 271', currency: 'KHR', policyTextKm: null, policyTextEn: 'Kept 30 days.', reminderAfterDays: 3, language: 'en', currencyLocked: false, version: 4 }

describe('settings form', () => {
  it('opens saved settings (none as blank) and sends them back at the version opened', () => {
    const form = toSettingsForm(saved)
    expect(form).toMatchObject({ phone: '', policyTextKm: '', address: 'St 271' })
    const request = v.parse(updateShopSettingsSchema, toSettingsRequest(form, saved.version))
    expect(request).toEqual({ version: 4, name: 'Sokha Laundry', phone: null, address: 'St 271', currency: 'KHR', policyTextKm: null, policyTextEn: 'Kept 30 days.', reminderAfterDays: 3, language: 'en' })
  })

  it.each([
    ['no name', { name: ' ' }],
    ['letters in the phone', { phone: '012 abc' }],
    ['a reminder of 0 days', { reminderAfterDays: 0 }],
    ['a reminder of 31 days', { reminderAfterDays: 31 }],
  ])('refuses %s, like the contract', (_case, change) => {
    const form = { ...toSettingsForm(saved), ...change }
    expect(v.safeParse(settingsFormSchema(t), form).success).toBe(false)
    expect(v.safeParse(updateShopSettingsSchema, toSettingsRequest(form, 1)).success).toBe(false)
  })
})
