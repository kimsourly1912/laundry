import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { PRICE_UNITS } from '#shared/contracts/prices'
import { inList, nowMs, shopId, timestamp } from '#server/db/columns'

/**
 * The shop's price list (D39; docs/server/data-model.md → price_items). Shop-owned. Archived,
 * never deleted: an order's lines point at the item they were priced from.
 */
export const priceItems = sqliteTable('price_items', {
  id: text().primaryKey(),
  shopId: shopId(),
  /** The stable key a slip's field is linked to; one item per key in a shop. */
  key: text().notNull(),
  label: text().notNull(),
  unit: text({ enum: PRICE_UNITS }).notNull(),
  /** Minor units of the shop's currency, per piece or per kg. */
  price: integer().notNull(),
  active: integer({ mode: 'boolean' }).notNull().default(true),
  version: integer().notNull().default(1),
  createdAt: timestamp().notNull().default(nowMs),
  updatedAt: timestamp().notNull().default(nowMs),
}, table => [
  uniqueIndex('price_items_shop_key_unique').on(table.shopId, table.key),
  index('price_items_shop_label_idx').on(table.shopId, table.label),
  uniqueIndex('price_items_shop_id_id_unique').on(table.shopId, table.id),
  check('price_items_unit_check', sql`${table.unit} in (${inList(PRICE_UNITS)})`),
  check('price_items_price_check', sql`${table.price} >= 0`),
])
