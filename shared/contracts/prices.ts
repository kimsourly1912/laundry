import * as v from 'valibot'
import { versionSchema } from './common'
import type { Currency } from './shop-settings'

/**
 * The shop's prices (`/api/shop/prices`, D43): the shop's slips decide what is priced, the owner only
 * sets how much. One row per priced key on the shop's attached slips, named and united by the item
 * list; the owner types the amount. A slip's count or weight is priced by the server from here, and
 * the order keeps the price it was charged.
 */

export const PRICE_UNITS = ['piece', 'kg'] as const
export type PriceUnit = typeof PRICE_UNITS[number]

/** A stable key the platform links slip fields to (`shirt`, `wash_kg`): the same across shops. */
export const priceKeySchema = v.pipe(v.string(), v.trim(), v.toLowerCase(), v.regex(/^[a-z\d][a-z\d._-]{0,39}$/, 'Letters, digits, dots and dashes; up to 40'))

/** At most this per piece or per kg, in minor units. */
export const PRICE_MAX = 100_000_000

/**
 * `PUT /api/shop/prices/:key`: the price of an item on the shop's slips, in minor units of the shop's
 * currency. `version` is the one read, or null when the item has no price yet.
 */
export const setPriceSchema = v.strictObject({
  price: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(PRICE_MAX)),
  version: v.nullable(versionSchema),
})
export type SetPriceInput = v.InferOutput<typeof setPriceSchema>

export interface ShopPrice {
  key: string
  label: string
  unit: PriceUnit
  /** Minor units per piece or per kg; null when the owner hasn't set one yet. */
  price: number | null
  /** The version to send with a change; null when there's no price yet. */
  version: number | null
  /** On one of the shop's attached slips. False: kept only because old orders name it. */
  onSlip: boolean
}

/** `GET /api/shop/prices`. */
export interface PriceList {
  currency: Currency
  items: ShopPrice[]
}

/** `GET /api/platform/shops/:shopId/prices`: how far the owner is, never the amounts (D43). */
export interface PriceStatus {
  /** Priced keys on the shop's attached slips. */
  needed: number
  /** Of those, the ones with a price. */
  set: number
}

/** The keys on the shop's slips with no price yet: staff can't fill them (D43). */
export function missingPrices(list: Pick<PriceList, 'items'>): ShopPrice[] {
  return list.items.filter(item => item.onSlip && item.price === null)
}
