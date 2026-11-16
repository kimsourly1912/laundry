import * as v from 'valibot'
import { nameSchema, optionalParam, optionalTextSchema, versionSchema } from './common'
import { MAX_ACTIVE_PRICE_ITEMS, MAX_ACTIVE_SERVICE_TYPES, PRICE_MAX, PRICE_NAME_MAX, PRICE_UNITS } from './pricing'
import type { PriceUnit } from './pricing'
import { CURRENCIES } from './shop-settings'
import type { Currency } from './shop-settings'

/**
 * Slip templates (`/api/platform/templates`, D25): the platform's ready-made price lists. A super
 * admin builds one per kind of shop (its services, its clothing items, a price for each pair) and
 * picks it when creating a shop: the shop gets its own **copy**, so a later template change never
 * touches an existing shop's prices. Prices are in the template's currency's minor units.
 */

export const TEMPLATE_STATUSES = ['active', 'archived'] as const
export type TemplateStatus = typeof TEMPLATE_STATUSES[number]

export const TEMPLATE_NAME_MAX = 80
/** How many templates may be active at once: the list is always read whole. */
export const MAX_ACTIVE_TEMPLATES = 100
/** Items on one slip (the rows of the price grid). */
export const MAX_TEMPLATE_ITEMS = 100

/**
 * A key names a service or an item inside one template, so a price can point at both. The UI
 * makes them; they never reach a shop (the copy gets ids).
 */
const keySchema = v.pipe(v.string(), v.regex(/^[\w-]{1,40}$/, 'Must be a short key'))

const names = {
  // English required, Khmer optional (D4), as on a shop's own price list.
  nameEn: nameSchema(PRICE_NAME_MAX, 'English name'),
  // `null` too: a saved definition goes back as it came.
  nameKm: v.nullable(optionalTextSchema(PRICE_NAME_MAX)),
}

const serviceSchema = v.strictObject({ key: keySchema, ...names })
const itemSchema = v.strictObject({ key: keySchema, ...names, unit: v.picklist(PRICE_UNITS) })
const priceSchema = v.strictObject({
  service: keySchema,
  item: keySchema,
  price: v.pipe(v.number(), v.integer('Must be a whole number of riel or cents'), v.minValue(0, 'Can\'t be negative'), v.maxValue(PRICE_MAX, 'Too high')),
})

function duplicates(keys: readonly string[]): boolean {
  return new Set(keys).size !== keys.length
}

/**
 * What a template holds, in slip order: services (the tabs), items (the rows), and the price of
 * each item in each service it's offered in. An item with no price in a service isn't offered there.
 */
export const templateDefinitionSchema = v.pipe(
  v.strictObject({
    services: v.pipe(v.array(serviceSchema), v.minLength(1, 'Add at least one service'), v.maxLength(MAX_ACTIVE_SERVICE_TYPES, 'Too many services')),
    items: v.pipe(v.array(itemSchema), v.minLength(1, 'Add at least one item'), v.maxLength(MAX_TEMPLATE_ITEMS, 'Too many items')),
    prices: v.pipe(v.array(priceSchema), v.minLength(1, 'Give at least one price'), v.maxLength(MAX_ACTIVE_PRICE_ITEMS, 'Too many prices')),
  }),
  v.forward(v.check(input => !duplicates(input.services.map(service => service.key)), 'Each service needs its own key'), ['services']),
  v.forward(v.check(input => !duplicates(input.items.map(item => item.key)), 'Each item needs its own key'), ['items']),
  v.forward(v.check((input) => {
    const services = new Set(input.services.map(service => service.key))
    const items = new Set(input.items.map(item => item.key))
    return input.prices.every(price => services.has(price.service) && items.has(price.item))
  }, 'A price names a service or item that isn\'t in the template'), ['prices']),
  v.forward(v.check(input => !duplicates(input.prices.map(price => `${price.service}\u0000${price.item}`)), 'An item has two prices in the same service'), ['prices']),
)
export type TemplateDefinition = v.InferOutput<typeof templateDefinitionSchema>

const fields = {
  name: nameSchema(TEMPLATE_NAME_MAX, 'Template name'),
  currency: v.picklist(CURRENCIES),
  definition: templateDefinitionSchema,
}

/** `POST /api/platform/templates`. */
export const createTemplateSchema = v.strictObject(fields)
export type CreateTemplateInput = v.InferOutput<typeof createTemplateSchema>

/** `PATCH /api/platform/templates/:templateId`: the whole template, at the version the admin read. */
export const updateTemplateSchema = v.strictObject({ ...fields, version: versionSchema })
export type UpdateTemplateInput = v.InferOutput<typeof updateTemplateSchema>

/** `POST …/archive` and `…/restore`. */
export const templateStatusChangeSchema = v.strictObject({ version: versionSchema })
export type TemplateStatusChangeInput = v.InferOutput<typeof templateStatusChangeSchema>

/** `GET /api/platform/templates?status=archived`: the active ones by default. */
export const templateListQuerySchema = v.object({ status: optionalParam(v.picklist(TEMPLATE_STATUSES)) })
export type TemplateListQuery = v.InferOutput<typeof templateListQuerySchema>

/** A template in the list: enough to pick one when creating a shop. */
export interface TemplateSummary {
  id: string
  name: string
  currency: Currency
  status: TemplateStatus
  serviceCount: number
  itemCount: number
  version: number
  /** ISO 8601. */
  updatedAt: string
}

export interface Template extends TemplateSummary {
  definition: TemplateDefinition
}

export interface TemplateList {
  items: TemplateSummary[]
}

/** A price-grid row as the copy makes it: one shop price item per (service, item) pair. */
export interface TemplatePriceRow {
  serviceKey: string
  itemKey: string
  nameEn: string
  nameKm: string | null
  unit: PriceUnit
  price: number
}

/**
 * The template's price items in slip order: by service, then by item (the order the admin gave),
 * the rows a shop's copy gets. Shared so the editor's preview and the copy agree.
 */
export function templatePriceRows(definition: TemplateDefinition): TemplatePriceRow[] {
  const prices = new Map(definition.prices.map(price => [`${price.service}\u0000${price.item}`, price.price]))
  return definition.services.flatMap(service => definition.items.flatMap((item) => {
    const price = prices.get(`${service.key}\u0000${item.key}`)
    return price === undefined ? [] : [{ serviceKey: service.key, itemKey: item.key, nameEn: item.nameEn, nameKm: item.nameKm, unit: item.unit, price }]
  }))
}
