import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { schema as authSchema } from '#auth/schema'

/** A shop is a Better Auth organization (spec T2); every shop table points at it, restrict. */
export const shopId = () => text().notNull().references(() => authSchema!.organization.id, { onDelete: 'restrict' })

/** The shop's own settings and status, one row per shop (spec §6, docs/server/data-model.md). */
export const shopSettings = sqliteTable('shop_settings', {
  shopId: shopId().primaryKey(),
  phone: text(),
  address: text(),
  currency: text({ enum: ['KHR', 'USD'] }).notNull().default('KHR'),
  policyTextKm: text(),
  policyTextEn: text(),
  reminderAfterDays: integer().notNull().default(3),
  // Customer-facing language: Telegram messages and the ticket page (D6).
  language: text({ enum: ['en', 'km'] }).notNull().default('en'),
  status: text({ enum: ['active', 'suspended'] }).notNull().default('active'),
  version: integer().notNull().default(1),
  createdAt: integer({ mode: 'timestamp_ms' }).notNull().default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
  updatedAt: integer({ mode: 'timestamp_ms' }).notNull().default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
}, table => [
  check('shop_settings_currency_check', sql`${table.currency} in ('KHR', 'USD')`),
  check('shop_settings_language_check', sql`${table.language} in ('en', 'km')`),
  check('shop_settings_status_check', sql`${table.status} in ('active', 'suspended')`),
  check('shop_settings_reminder_check', sql`${table.reminderAfterDays} between 1 and 30`),
])
