import { sql } from 'drizzle-orm'
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { IMAGE_MAX_BYTES, IMAGE_MAX_SIDE, IMAGE_MIN_SIDE, IMAGE_TYPES, TEMPLATE_STATUSES } from '#shared/contracts/templates'
import type { SlipDesign } from '#shared/contracts/slip-design'
import { createdBy, inList, nowMs, shopId, timestamp } from '#server/db/columns'

/**
 * Slip templates (D31, plan §5, §7; docs/server/data-model.md → templates). The platform designs them
 * in the studio and attaches them to shops. `templates`, `template_versions` and `images` are
 * platform tables (no `shop_id`); `template_shops` is shop-owned.
 *
 * A design is one JSON document, checked by its Valibot schema on every write: read whole,
 * never queried inside. Templates are archived, never deleted; versions never change.
 */

/** The design document's shape is `designSchema` (`#shared/contracts/slip-design`), checked on every write. */
export type StoredDesign = SlipDesign

export const templates = sqliteTable('templates', {
  id: text().primaryKey(),
  name: text().notNull(),
  /** `draft`: never published. `published`: has a version. `archived`: hidden, kept for its orders. */
  status: text({ enum: TEMPLATE_STATUSES }).notNull().default('draft'),
  /** The design being edited; each publish copies it into `template_versions`. */
  design: text({ mode: 'json' }).$type<StoredDesign>().notNull(),
  version: integer().notNull().default(1),
  createdBy: createdBy(),
  createdAt: timestamp().notNull().default(nowMs),
  updatedAt: timestamp().notNull().default(nowMs),
}, table => [
  // The platform finds a template by name: two never share one, whatever the case.
  uniqueIndex('templates_name_unique').on(sql`lower(${table.name})`),
  index('templates_status_updated_idx').on(table.status, table.updatedAt),
  check('templates_status_check', sql`${table.status} in (${inList(TEMPLATE_STATUSES)})`),
  check('templates_design_check', sql`json_valid(${table.design})`),
])

/**
 * A published design, fixed forever: an order keeps the version it was made on, so its slip never
 * changes (plan §4). The latest one is the highest `number`.
 */
export const templateVersions = sqliteTable('template_versions', {
  id: text().primaryKey(),
  templateId: text().notNull().references(() => templates.id, { onDelete: 'restrict' }),
  number: integer().notNull(),
  design: text({ mode: 'json' }).$type<StoredDesign>().notNull(),
  createdBy: createdBy(),
  createdAt: timestamp().notNull().default(nowMs),
}, table => [
  // Also the "latest version" lookup: (template_id, number desc).
  uniqueIndex('template_versions_template_number_unique').on(table.templateId, table.number),
  check('template_versions_number_check', sql`${table.number} >= 1`),
  check('template_versions_design_check', sql`json_valid(${table.design})`),
])

/**
 * Which templates a shop may use, and its default (plan §4). The default is a flag here, not a column
 * on `shop_settings`, so it can only be an attached template, and detaching it clears it.
 */
export const templateShops = sqliteTable('template_shops', {
  shopId: shopId(),
  templateId: text().notNull().references(() => templates.id, { onDelete: 'restrict' }),
  isDefault: integer({ mode: 'boolean' }).notNull().default(false),
  attachedAt: timestamp().notNull().default(nowMs),
}, table => [
  primaryKey({ name: 'template_shops_pk', columns: [table.shopId, table.templateId] }),
  // At most one default per shop.
  uniqueIndex('template_shops_default_unique').on(table.shopId).where(sql`${table.isDefault}`),
  // The shops a template is attached to (the template's page).
  index('template_shops_template_idx').on(table.templateId),
])

/**
 * The platform's uploaded images (plan §5.9): slip backgrounds, pictures on a slip, shop logos.
 * Shared by every template; base64 in the row, as D28 did: an image is read whole, on every render.
 */
export const images = sqliteTable('images', {
  id: text().primaryKey(),
  name: text().notNull(),
  type: text({ enum: IMAGE_TYPES }).notNull(),
  width: integer().notNull(),
  height: integer().notNull(),
  /** The file's size in bytes, before base64. */
  size: integer().notNull(),
  data: text().notNull(),
  createdBy: createdBy(),
  createdAt: timestamp().notNull().default(nowMs),
}, table => [
  index('images_created_idx').on(table.createdAt),
  check('images_type_check', sql`${table.type} in (${inList(IMAGE_TYPES)})`),
  check('images_size_check', sql`${table.size} between 1 and ${sql.raw(String(IMAGE_MAX_BYTES))}`),
  check('images_sides_check', sql`${table.width} between ${sql.raw(String(IMAGE_MIN_SIDE))} and ${sql.raw(String(IMAGE_MAX_SIDE))} and ${table.height} between ${sql.raw(String(IMAGE_MIN_SIDE))} and ${sql.raw(String(IMAGE_MAX_SIDE))}`),
])
