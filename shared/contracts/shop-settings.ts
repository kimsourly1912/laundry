/**
 * The shop's details as the owner's app reads them (`GET /api/shop/settings`): what its slips print.
 * Only the platform changes them (D44, `PATCH /api/platform/shops/:shopId`).
 */

export const CURRENCIES = ['KHR', 'USD'] as const
export type Currency = typeof CURRENCIES[number]

export interface ShopSettings {
  name: string
  phone: string | null
  address: string | null
  currency: Currency
  version: number
}
