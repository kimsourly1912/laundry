import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { nowMs, shopId, timestamp } from '#server/db/columns'
import { images } from '#server/features/templates/templates.schema'

/**
 * The shop's own details and status, one row per shop (plan §7, docs/server/data-model.md). The
 * shop's name is the organization's. An order keeps a copy of these details when it's saved
 * (D33), so changing them never changes an old slip.
 */
export const shopSettings = sqliteTable('shop_settings', {
  shopId: shopId().primaryKey(),
  phone: text(),
  address: text(),
  /** No screen sets it since D35 (the artwork carries the shop's look); kept for the order's copy. */
  logoImageId: text().references(() => images.id, { onDelete: 'restrict' }),
  currency: text({ enum: ['KHR', 'USD'] }).notNull().default('KHR'),
  // No longer read or written: the app is English only (D36). Dropped by a later migration
  // (operations.md → Migrations: expand, then contract).
  language: text({ enum: ['en', 'km'] }).notNull().default('en'),
  status: text({ enum: ['active', 'suspended'] }).notNull().default('active'),
  version: integer().notNull().default(1),
  createdAt: timestamp().notNull().default(nowMs),
  updatedAt: timestamp().notNull().default(nowMs),
}, table => [
  check('shop_settings_currency_check', sql`${table.currency} in ('KHR', 'USD')`),
  check('shop_settings_language_check', sql`${table.language} in ('en', 'km')`),
  check('shop_settings_status_check', sql`${table.status} in ('active', 'suspended')`),
])
