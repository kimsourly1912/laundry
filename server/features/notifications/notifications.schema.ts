import { sql } from 'drizzle-orm'
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { customers } from '#server/features/customers/customers.schema'
import { orders } from '#server/features/orders/orders.schema'
import { shopId } from '#server/features/shops/shops.schema'
import { NOTIFICATION_KINDS, NOTIFICATION_STATUSES } from './notifications.types'

/**
 * Who gets a shop's messages on Telegram, and the messages waiting to go (D28, spec §8.2–§8.3,
 * docs/server/data-model.md → telegram_links, notifications).
 */

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`
const timestamp = () => integer({ mode: 'timestamp_ms' })
const inList = (values: readonly string[]) => sql.raw(values.map(value => `'${value}'`).join(', '))

/**
 * A Telegram chat linked to a customer of a shop: for all their orders when they proved the phone
 * (`order_id` null, `verified_phone`), else for one order. Revoked, never deleted, when the person
 * blocks the bot or the customer is anonymized. Telegram's ids are kept as text: they're up to 52
 * bits, and only ever compared.
 */
export const telegramLinks = sqliteTable('telegram_links', {
  id: text().primaryKey(),
  shopId: shopId(),
  customerId: text().notNull(),
  orderId: text(),
  telegramUserId: text().notNull(),
  chatId: text().notNull(),
  verifiedPhone: integer({ mode: 'boolean' }).notNull(),
  linkedAt: timestamp().notNull().default(nowMs),
  revokedAt: timestamp(),
}, table => [
  foreignKey({ columns: [table.shopId, table.customerId], foreignColumns: [customers.shopId, customers.id], name: 'telegram_links_customer_fk' }).onDelete('cascade'),
  foreignKey({ columns: [table.shopId, table.orderId], foreignColumns: [orders.shopId, orders.id], name: 'telegram_links_order_fk' }).onDelete('cascade'),
  // One live link per person and customer (all orders), and per person and order.
  uniqueIndex('telegram_links_customer_unique').on(table.shopId, table.customerId, table.telegramUserId).where(sql`${table.revokedAt} is null and ${table.orderId} is null`),
  uniqueIndex('telegram_links_order_unique').on(table.shopId, table.orderId, table.telegramUserId).where(sql`${table.revokedAt} is null and ${table.orderId} is not null`),
  index('telegram_links_chat_idx').on(table.chatId),
  // An order-only link is a phone the person didn't prove, so it can't be "verified".
  check('telegram_links_verified_check', sql`not (${table.verifiedPhone} and ${table.orderId} is not null)`),
])

/**
 * The outbox (spec §8.3): one row per message and chat, written in the batch of the change it
 * tells about, sent by `notifications:deliver`. The id is the dedupe key
 * (`ready:<order>:<version>:<chat>`), so a retried change or a person linked twice gets one
 * message. Sent, skipped and failed rows are purged after 90 days.
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
