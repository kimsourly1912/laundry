import { sql } from 'drizzle-orm'
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { inList, nowMs, shopId, timestamp } from '#server/db/columns'
import { orders } from '#server/features/orders/orders.schema'
import { NOTIFICATION_KINDS, NOTIFICATION_STATUSES } from './notifications.types'

/**
 * Who gets an order's slip on Telegram, and the messages waiting to go (D28, plan §8,
 * docs/server/data-model.md → telegram_links, notifications).
 */

/**
 * A Telegram chat linked to one order (plan §8: order-only links). Revoked, never deleted, when the
 * person blocks the bot. Telegram's ids are kept as text: they're up to 52 bits, and only compared.
 */
export const telegramLinks = sqliteTable('telegram_links', {
  id: text().primaryKey(),
  shopId: shopId(),
  orderId: text().notNull(),
  telegramUserId: text().notNull(),
  chatId: text().notNull(),
  linkedAt: timestamp().notNull().default(nowMs),
  revokedAt: timestamp(),
}, table => [
  foreignKey({ columns: [table.shopId, table.orderId], foreignColumns: [orders.shopId, orders.id], name: 'telegram_links_order_fk' }).onDelete('cascade'),
  // One live link per person and order.
  uniqueIndex('telegram_links_order_unique').on(table.shopId, table.orderId, table.telegramUserId).where(sql`${table.revokedAt} is null`),
  index('telegram_links_chat_idx').on(table.chatId),
])

/**
 * The outbox (spec §8.3): one row per message and chat, written in the batch of the change it
 * tells about, sent by the delivery job (step 4). The id is the dedupe key (`slip:<order>:<chat>`),
 * so a person linked twice gets one message. Sent, skipped and failed rows are purged after 90 days.
 */
export const notifications = sqliteTable('notifications', {
  id: text().primaryKey(),
  shopId: shopId(),
  orderId: text().notNull(),
  chatId: text().notNull(),
  kind: text({ enum: NOTIFICATION_KINDS }).notNull(),
  status: text({ enum: NOTIFICATION_STATUSES }).notNull().default('pending'),
  attempts: integer().notNull().default(0),
  lastError: text(),
  nextAttemptAt: timestamp().notNull(),
  createdAt: timestamp().notNull().default(nowMs),
  sentAt: timestamp(),
}, table => [
  foreignKey({ columns: [table.shopId, table.orderId], foreignColumns: [orders.shopId, orders.id], name: 'notifications_order_fk' }).onDelete('cascade'),
  // The delivery job's scan, across shops: what's due first.
  index('notifications_due_idx').on(table.status, table.nextAttemptAt),
  index('notifications_order_idx').on(table.shopId, table.orderId),
  check('notifications_kind_check', sql`${table.kind} in (${inList(NOTIFICATION_KINDS)})`),
  check('notifications_status_check', sql`${table.status} in (${inList(NOTIFICATION_STATUSES)})`),
  check('notifications_attempts_check', sql`${table.attempts} >= 0`),
])
