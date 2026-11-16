import * as v from 'valibot'
import { nameSchema, optionalTextSchema, versionSchema } from './common'
import { SHOP_NAME_MAX } from './platform-shops'

/** The shop's own settings (`/api/shop/settings`, spec §3 → Shop settings, step M2.1). */

export const CURRENCIES = ['KHR', 'USD'] as const
export type Currency = typeof CURRENCIES[number]
export const SHOP_LANGUAGES = ['en', 'km'] as const
export type ShopLanguage = typeof SHOP_LANGUAGES[number]

export const POLICY_TEXT_MAX = 1000
export const REMINDER_DAYS_MIN = 1
export const REMINDER_DAYS_MAX = 30

/** A phone number as shown to customers: digits, spaces, `+`, `-`, `(`, `)`. */
const shopPhoneSchema = v.pipe(optionalTextSchema(30), v.check(phone => phone === null || /^[\d\s+\-()]+$/.test(phone), 'Use digits, spaces, + and - only'))

/** `PATCH /api/shop/settings`: every setting, at the version read. */
export const updateShopSettingsSchema = v.strictObject({
  version: versionSchema,
  name: nameSchema(SHOP_NAME_MAX, 'Shop name'),
  phone: shopPhoneSchema,
  address: optionalTextSchema(200),
  /** Changes only while the price list is empty: prices are amounts in this currency (D22). */
  currency: v.picklist(CURRENCIES),
  policyTextKm: optionalTextSchema(POLICY_TEXT_MAX),
  policyTextEn: optionalTextSchema(POLICY_TEXT_MAX),
  reminderAfterDays: v.pipe(v.number(), v.integer(), v.minValue(REMINDER_DAYS_MIN), v.maxValue(REMINDER_DAYS_MAX)),
  /** The language of the shop's customer-facing messages and ticket page (D6). */
  language: v.picklist(SHOP_LANGUAGES),
})
export type UpdateShopSettingsInput = v.InferOutput<typeof updateShopSettingsSchema>

export interface ShopSettings {
  name: string
  phone: string | null
  address: string | null
  currency: Currency
  policyTextKm: string | null
  policyTextEn: string | null
  reminderAfterDays: number
  language: ShopLanguage
  /** The price list isn't empty: the currency can't change (D22). */
  currencyLocked: boolean
  version: number
}
