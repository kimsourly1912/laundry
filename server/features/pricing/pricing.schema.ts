import { sql } from 'drizzle-orm'
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { shopId } from '#server/features/shops/shops.schema'

/**
 * A shop's price list (spec §6, docs/server/data-model.md → service_types, price_items): service
 * types ("Wash & iron") group price items ("Shirt", per piece; "Mixed clothes", per kg). Archived,
 * never deleted: an order's lines keep their own copy of names and prices (M2.3).
 */

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`
const timestamps = {
  createdAt: integer({ mode: 'timestamp_ms' }).notNull().default(nowMs),
  updatedAt: integer({ mode: 'timestamp_ms' }).notNull().default(nowMs),
}

export const PRICE_STATUSES = ['active', 'archived'] as const
export const PRICE_UNITS = ['piece', 'kg'] as const

export const serviceTypes = sqliteTable('service_types', {
  id: text().primaryKey(),
  shopId: shopId(),
  // English required, Khmer optional (D4).
  nameEn: text().notNull(),
  nameKm: text(),
  sort: integer().notNull(),
  status: text({ enum: PRICE_STATUSES }).notNull().default('active'),
  version: integer().notNull().default(1),
  ...timestamps,
}, table => [
  // The target of price_items' composite foreign key: an item's service type is its own shop's.
  uniqueIndex('service_types_shop_id_id_unique').on(table.shopId, table.id),
  index('service_types_shop_status_sort_idx').on(table.shopId, table.status, table.sort),
  check('service_types_status_check', sql`${table.status} in ('active', 'archived')`),
])

export const priceItems = sqliteTable('price_items', {
  id: text().primaryKey(),
  shopId: shopId(),
  serviceTypeId: text().notNull(),
  nameEn: text().notNull(),
  nameKm: text(),
  unit: text({ enum: PRICE_UNITS }).notNull(),
  /** Minor units of the shop's currency (riel, cents), per piece or per kg (spec T12). */
  price: integer().notNull(),
  sort: integer().notNull(),
  status: text({ enum: PRICE_STATUSES }).notNull().default('active'),
  version: integer().notNull().default(1),
  ...timestamps,
}, table => [
  // Same shop, by construction: (shop_id, service_type_id) must name a service type of this shop.
  foreignKey({ columns: [table.shopId, table.serviceTypeId], foreignColumns: [serviceTypes.shopId, serviceTypes.id], name: 'price_items_service_type_fk' }).onDelete('restrict'),
  index('price_items_shop_status_sort_idx').on(table.shopId, table.status, table.sort),
  index('price_items_service_type_idx').on(table.shopId, table.serviceTypeId),
  check('price_items_status_check', sql`${table.status} in ('active', 'archived')`),
  check('price_items_unit_check', sql`${table.unit} in ('piece', 'kg')`),
  check('price_items_price_check', sql`${table.price} >= 0`),
])
