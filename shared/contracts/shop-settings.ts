import * as v from 'valibot'
import { nameSchema, optionalTextSchema, versionSchema } from './common'
import { SHOP_NAME_MAX } from './platform-shops'

/** The shop's own settings (`/api/shop/settings`, spec §3 → Shop settings, step M2.1). */

export const CURRENCIES = ['KHR', 'USD'] as const
export type Currency = typeof CURRENCIES[number]

/** A phone number as shown to customers: digits, spaces, `+`, `-`, `(`, `)`. */
const shopPhoneSchema = v.pipe(optionalTextSchema(30), v.check(phone => phone === null || /^[\d\s+\-()]+$/.test(phone), 'Use digits, spaces, + and - only'))

/** `PATCH /api/shop/settings`: every setting, at the version read. */
export const updateShopSettingsSchema = v.strictObject({
  version: versionSchema,
  name: nameSchema(SHOP_NAME_MAX, 'Shop name'),
  phone: shopPhoneSchema,
  address: optionalTextSchema(200),
  /** Orders keep a copy of it (D33), so it may change at any time. */
  currency: v.picklist(CURRENCIES),
})
export type UpdateShopSettingsInput = v.InferOutput<typeof updateShopSettingsSchema>

export interface ShopSettings {
  name: string
  phone: string | null
  address: string | null
  currency: Currency
  version: number
}
