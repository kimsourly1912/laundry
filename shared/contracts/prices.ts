import * as v from 'valibot'
import { nameSchema, versionSchema } from './common'
import type { Currency } from './shop-settings'

/**
 * The shop's price list (`/api/shop/prices`, D39; product notes → price list): what an item or a
 * service costs, per piece or per kg. A slip's count field linked to a price key (Studio) gets its
 * line priced by the server; the order keeps the price charged.
 */

export const PRICE_UNITS = ['piece', 'kg'] as const
export type PriceUnit = typeof PRICE_UNITS[number]

/** A stable key the platform links slip fields to (`shirt`, `shirt.dry`): the same across shops. */
export const priceKeySchema = v.pipe(v.string(), v.trim(), v.toLowerCase(), v.regex(/^[a-z\d][a-z\d._-]{0,39}$/, 'Letters, digits, dots and dashes; up to 40'))

/** At most this per piece or per kg, in minor units. */
export const PRICE_MAX = 100_000_000

const priceFields = {
  label: nameSchema(80, 'Label'),
  unit: v.picklist(PRICE_UNITS),
  /** Minor units of the shop's currency (riel, or cents). */
  price: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(PRICE_MAX)),
}

/** `POST /api/shop/prices`. */
export const createPriceSchema = v.strictObject({ key: priceKeySchema, ...priceFields })
export type CreatePriceInput = v.InferOutput<typeof createPriceSchema>

/** `PATCH /api/shop/prices/:id`: label, unit and price at the version read; the key never changes (orders and slips name it). */
export const updatePriceSchema = v.strictObject({ version: versionSchema, ...priceFields })
export type UpdatePriceInput = v.InferOutput<typeof updatePriceSchema>

/** `POST …/archive` and `…/restore`. */
export const priceStatusSchema = v.strictObject({ version: versionSchema })

export interface PriceItem {
  id: string
  key: string
  label: string
  unit: PriceUnit
  price: number
  currency: Currency
  /** Archived items price no new order. */
  active: boolean
  version: number
}
