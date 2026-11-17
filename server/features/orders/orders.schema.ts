import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { createdBy, inList, nowMs, shopId, timestamp } from '#server/db/columns'
import { templateVersions } from '#server/features/templates/templates.schema'

/**
 * A shop's orders (D31, plan §4, §7; docs/server/data-model.md → orders): a filled slip. Never
 * deleted: cancelled. The order keeps the template version it was made on and a copy of the shop's
 * details (D33), so its slip never changes.
 */

export const ORDER_STATUSES = ['open', 'picked_up', 'cancelled'] as const
export type OrderStatus = typeof ORDER_STATUSES[number]

/** The shop's details as they were when the order was saved (D33): what the slip draws. */
export interface OrderShopCopy {
  name: string
  phone: string | null
  address: string | null
  logoImageId: string | null
  currency: 'KHR' | 'USD'
  language: 'en' | 'km'
}

/** The last order number each shop gave out: raised and used in the order's own batch. */
export const orderCounters = sqliteTable('order_counters', {
  shopId: shopId().primaryKey(),
  lastNumber: integer().notNull(),
}, table => [
  check('order_counters_last_number_check', sql`${table.lastNumber} >= 0`),
])

export const orders = sqliteTable('orders', {
  id: text().primaryKey(),
  shopId: shopId(),
  number: integer().notNull(),
  /** The shop's day the order was made (`YYYY-MM-DD`, the shop's time zone), set by the server. */
  date: text().notNull(),
  templateVersionId: text().notNull().references(() => templateVersions.id, { onDelete: 'restrict' }),
  /** The owner's values by element id, checked against the template version by the server. */
  values: text({ mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  shop: text({ mode: 'json' }).$type<OrderShopCopy>().notNull(),
  /** E.164, from the Phone field; `null` when the order has none. */
  phone: text(),
  /** Minor units of the shop copy's currency, as the owner typed it; `null` when the slip has no Amount. */
  amount: integer(),
  paid: integer({ mode: 'boolean' }).notNull().default(false),
  status: text({ enum: ORDER_STATUSES }).notNull().default('open'),
  paidAt: timestamp(),
  pickedUpAt: timestamp(),
  cancelledAt: timestamp(),
  version: integer().notNull().default(1),
  createdBy: createdBy(),
  createdAt: timestamp().notNull().default(nowMs),
  updatedAt: timestamp().notNull().default(nowMs),
}, table => [
  uniqueIndex('orders_shop_number_unique').on(table.shopId, table.number),
  // The target of the Telegram tables' composite foreign keys: a row there names an order of its own shop.
  uniqueIndex('orders_shop_id_id_unique').on(table.shopId, table.id),
  // Overview (today's orders) and the list, newest first.
  index('orders_shop_date_idx').on(table.shopId, table.date, table.createdAt),
  index('orders_shop_created_idx').on(table.shopId, table.createdAt),
  check('orders_status_check', sql`${table.status} in (${inList(ORDER_STATUSES)})`),
  check('orders_number_check', sql`${table.number} >= 1`),
  check('orders_date_check', sql`${table.date} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`),
  check('orders_amount_check', sql`${table.amount} is null or ${table.amount} >= 0`),
  check('orders_values_check', sql`json_valid(${table.values})`),
  check('orders_shop_check', sql`json_valid(${table.shop})`),
  // Each time is there exactly when its state is.
  check('orders_paid_at_check', sql`${table.paid} = (${table.paidAt} is not null)`),
  check('orders_picked_up_at_check', sql`(${table.status} = 'picked_up') = (${table.pickedUpAt} is not null)`),
  check('orders_cancelled_at_check', sql`(${table.status} = 'cancelled') = (${table.cancelledAt} is not null)`),
])
