import { sql } from 'drizzle-orm'
import { foreignKey, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { orders } from '#server/features/orders/orders.schema'
import { shopId } from '#server/features/shops/shops.schema'

/**
 * The way into a shop's Telegram messages (D28, spec §8.2): the QR the counter shows for an
 * order, and the phone check in between. Both are short-lived; the daily purge deletes them.
 */

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`
const timestamp = () => integer({ mode: 'timestamp_ms' })

/**
 * A QR code's token, as its SHA-256: a person who scans it starts linking to the order. Only the
 * hash is stored, so a database read can't make a working QR. Usable by anyone holding it until it
 * expires (a family can share one); all it gives without the customer's phone is that one order.
 */
export const telegramInvites = sqliteTable('telegram_invites', {
  tokenHash: text().primaryKey(),
  shopId: shopId(),
  orderId: text().notNull(),
  expiresAt: timestamp().notNull(),
  createdAt: timestamp().notNull().default(nowMs),
}, table => [
  foreignKey({ columns: [table.shopId, table.orderId], foreignColumns: [orders.shopId, orders.id], name: 'telegram_invites_order_fk' }).onDelete('cascade'),
  index('telegram_invites_expires_idx').on(table.expiresAt),
])

/**
 * A person who scanned and was asked for their phone (spec §8.2: kept 10 minutes). One per
 * Telegram account: a new scan replaces it.
 */
export const telegramPending = sqliteTable('telegram_pending', {
  telegramUserId: text().primaryKey(),
  shopId: shopId(),
  orderId: text().notNull(),
  chatId: text().notNull(),
  expiresAt: timestamp().notNull(),
}, table => [
  foreignKey({ columns: [table.shopId, table.orderId], foreignColumns: [orders.shopId, orders.id], name: 'telegram_pending_order_fk' }).onDelete('cascade'),
  index('telegram_pending_expires_idx').on(table.expiresAt),
])
