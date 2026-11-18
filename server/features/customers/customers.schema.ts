import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { nowMs, shopId, timestamp } from '#server/db/columns'

/**
 * The shop's customers (D39; docs/server/data-model.md → customers). Shop-owned; never deleted
 * while their orders exist (an order points at them, restrict).
 */
export const customers = sqliteTable('customers', {
  id: text().primaryKey(),
  shopId: shopId(),
  name: text().notNull(),
  /** E.164; one customer per phone in a shop. */
  phone: text(),
  version: integer().notNull().default(1),
  createdAt: timestamp().notNull().default(nowMs),
  updatedAt: timestamp().notNull().default(nowMs),
}, table => [
  // The counter finds a customer by phone: at most one per shop.
  uniqueIndex('customers_shop_phone_unique').on(table.shopId, table.phone).where(sql`${table.phone} is not null`),
  // The list, by name.
  index('customers_shop_name_idx').on(table.shopId, table.name),
  // Orders point at (shop_id, id): an order's customer is always of its own shop.
  uniqueIndex('customers_shop_id_id_unique').on(table.shopId, table.id),
])
