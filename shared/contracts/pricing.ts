import * as v from 'valibot'
import { idSchema, nameSchema, optionalParam, optionalTextSchema, versionSchema } from './common'

/**
 * The shop's price list (`/api/shop/service-types`, `/api/shop/price-items`, spec §9, step M2.1).
 * Prices are integers in the shop's currency's minor units: riel, or US cents (spec T12). Weight
 * items are priced per kg. Archived, never deleted.
 */

export const PRICE_STATUSES = ['active', 'archived'] as const
export type PriceStatus = typeof PRICE_STATUSES[number]
export const PRICE_UNITS = ['piece', 'kg'] as const
export type PriceUnit = typeof PRICE_UNITS[number]

export const PRICE_NAME_MAX = 60
/** The highest price: 100,000,000 minor units (100 million riel, or 1 million dollars). */
export const PRICE_MAX = 100_000_000
/** How many active entries a shop's list holds, so a list is always read whole (D22). */
export const MAX_ACTIVE_SERVICE_TYPES = 50
export const MAX_ACTIVE_PRICE_ITEMS = 300

const names = {
  // English required, Khmer optional (D4).
  nameEn: nameSchema(PRICE_NAME_MAX, 'English name'),
  nameKm: optionalTextSchema(PRICE_NAME_MAX),
}

export const serviceTypeInputSchema = v.strictObject(names)
export type ServiceTypeInput = v.InferOutput<typeof serviceTypeInputSchema>
export const updateServiceTypeSchema = v.strictObject({ ...names, version: versionSchema })
export type UpdateServiceTypeInput = v.InferOutput<typeof updateServiceTypeSchema>

const priceSchema = v.pipe(v.number(), v.integer('Must be a whole number of riel or cents'), v.minValue(0, 'Can\'t be negative'), v.maxValue(PRICE_MAX, 'Too high'))

const itemFields = {
  ...names,
  serviceTypeId: idSchema,
  unit: v.picklist(PRICE_UNITS),
  price: priceSchema,
}

export const priceItemInputSchema = v.strictObject(itemFields)
export type PriceItemInput = v.InferOutput<typeof priceItemInputSchema>
export const updatePriceItemSchema = v.strictObject({ ...itemFields, version: versionSchema })
export type UpdatePriceItemInput = v.InferOutput<typeof updatePriceItemSchema>

/** `GET …?status=archived`: the archived ones; the active ones by default. */
export const priceListQuerySchema = v.object({ status: optionalParam(v.picklist(PRICE_STATUSES)) })
export type PriceListQuery = v.InferOutput<typeof priceListQuerySchema>

export interface ServiceType {
  id: string
  nameEn: string
  nameKm: string | null
  sort: number
  status: PriceStatus
  version: number
}

export interface PriceItem {
  id: string
  serviceTypeId: string
  nameEn: string
  nameKm: string | null
  unit: PriceUnit
  /** Minor units of `currency`, per piece or per kg. */
  price: number
  sort: number
  status: PriceStatus
  version: number
}

/** A whole list (bounded by the caps above): no pages. */
export interface ServiceTypeList {
  items: ServiceType[]
}

/** Prices are in the shop's currency (`ShopSettings.currency`). */
export interface PriceItemList {
  items: PriceItem[]
}
