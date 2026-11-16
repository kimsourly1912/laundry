import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { shopId } from '#server/features/shops/shops.schema'

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`

/**
 * A shop's customers (spec §6, docs/server/data-model.md → customers). Never deleted: anonymized
 * (P11), which clears the name, phone and note and frees the phone for reuse.
 */
export const customers = sqliteTable('customers', {
  id: text().primaryKey(),
  shopId: shopId(),
  /** Empty once anonymized ("Former customer" in the app). */
  name: text().notNull(),
  /** E.164 (`+85512345678`), normalized on the server; `null` when none. */
  phoneE164: text('phone_e164'),
  note: text(),
  anonymizedAt: integer({ mode: 'timestamp_ms' }),
  version: integer().notNull().default(1),
  createdAt: integer({ mode: 'timestamp_ms' }).notNull().default(nowMs),
  updatedAt: integer({ mode: 'timestamp_ms' }).notNull().default(nowMs),
}, table => [
  // One customer per phone in a shop (spec §6); an anonymized customer has none, so it's free again.
  uniqueIndex('customers_shop_phone_unique').on(table.shopId, table.phoneE164).where(sql`${table.phoneE164} is not null`),
  // The list: most recently changed first.
  index('customers_shop_updated_idx').on(table.shopId, table.updatedAt),
])
