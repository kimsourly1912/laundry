import { foreignKey, index, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { nowMs, shopId, timestamp } from '#server/db/columns'
import { orders } from '#server/features/orders/orders.schema'

/**
 * The way into an order's slip on Telegram (D28, plan §8): the QR the shop shows after saving an
 * order. Short-lived; the daily purge deletes expired ones. The phone check's table comes back in
 * step 4 only if the owner keeps the check (plan Q11).
 */

/**
 * A QR code's token, as its SHA-256: whoever scans it gets that order's slip. Only the hash is
 * stored, so a database read can't make a working QR.
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
