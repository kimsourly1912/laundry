import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { shopId } from '#server/features/shops/shops.schema'
import type { ReceiptField } from '#shared/contracts/receipts'
import { MAX_RECEIPT_SIDE, MIN_RECEIPT_SIDE, RECEIPT_IMAGE_TYPES } from '#shared/contracts/receipts'

/**
 * A shop's receipt design (D28, docs/server/data-model.md → receipt_designs): one per shop, kept by
 * the platform. The background is stored here, as base64 text: it's at most 1 MB (1.34 MB as
 * text, under D1's 2 MB row limit), read whole for each receipt, and goes into the SVG as base64
 * anyway. D1 returns a BLOB as an array of numbers, a poor fit for a megabyte. Every query but the
 * background's own leaves the image column out.
 */

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`
const inList = (values: readonly string[]) => sql.raw(values.map(value => `'${value}'`).join(', '))

export const receiptDesigns = sqliteTable('receipt_designs', {
  shopId: shopId().primaryKey(),
  /** The background image, base64. */
  image: text().notNull(),
  imageType: text({ enum: RECEIPT_IMAGE_TYPES }).notNull(),
  /** The image's size in pixels: the receipt's size and the fields' coordinate space. */
  width: integer().notNull(),
  height: integer().notNull(),
  /** Checked by `receiptFieldsSchema` on every write; read whole, never queried inside. */
  fields: text({ mode: 'json' }).$type<ReceiptField[]>().notNull(),
  version: integer().notNull().default(1),
  createdAt: integer({ mode: 'timestamp_ms' }).notNull().default(nowMs),
  updatedAt: integer({ mode: 'timestamp_ms' }).notNull().default(nowMs),
}, table => [
  check('receipt_designs_image_type_check', sql`${table.imageType} in (${inList(RECEIPT_IMAGE_TYPES)})`),
  check('receipt_designs_size_check', sql`${table.width} between ${sql.raw(String(MIN_RECEIPT_SIDE))} and ${sql.raw(String(MAX_RECEIPT_SIDE))} and ${table.height} between ${sql.raw(String(MIN_RECEIPT_SIDE))} and ${sql.raw(String(MAX_RECEIPT_SIDE))}`),
  check('receipt_designs_fields_check', sql`json_valid(${table.fields}) and json_type(${table.fields}) = 'array'`),
])
