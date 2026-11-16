import { sql } from 'drizzle-orm'
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { schema as authSchema } from '#auth/schema'
import { customers } from '#server/features/customers/customers.schema'
import { priceItems } from '#server/features/pricing/pricing.schema'
import { shopId } from '#server/features/shops/shops.schema'
import { ORDER_EVENT_TYPES, ORDER_STATUSES, PAYMENT_STATUSES } from '#shared/contracts/orders'
import { PRICE_UNITS } from '#shared/contracts/pricing'

/**
 * A shop's orders (spec §6, §7, docs/server/data-model.md → orders). Never deleted: cancelled.
 * Lines copy their names and prices from the price list, so a later price change never changes an
 * old order (spec §16).
 */

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`
const timestamp = () => integer({ mode: 'timestamp_ms' })
const inList = (values: readonly string[]) => sql.raw(values.map(value => `'${value}'`).join(', '))

/** The last order number each shop gave out: raised and used in the order's own batch. */
export const orderCounters = sqliteTable('order_counters', {
  shopId: shopId().primaryKey(),
  lastNumber: integer().notNull(),
})

export const orders = sqliteTable('orders', {
  id: text().primaryKey(),
  shopId: shopId(),
  number: integer().notNull(),
  customerId: text().notNull(),
  status: text({ enum: ORDER_STATUSES }).notNull().default('received'),
  paymentStatus: text({ enum: PAYMENT_STATUSES }).notNull().default('unpaid'),
  /** Minor units of `currency`, computed by the server from the lines. */
  total: integer().notNull(),
  /** The shop's currency when the order was made. */
  currency: text({ enum: ['KHR', 'USD'] }).notNull(),
  note: text(),
  readyAt: timestamp(),
  collectedAt: timestamp(),
  paidAt: timestamp(),
  cancelledAt: timestamp(),
  version: integer().notNull().default(1),
  createdBy: text().notNull().references(() => authSchema!.user.id, { onDelete: 'restrict' }),
  createdAt: timestamp().notNull().default(nowMs),
  updatedAt: timestamp().notNull().default(nowMs),
}, table => [
  // Same shop, by construction: (shop_id, customer_id) must name a customer of this shop.
  foreignKey({ columns: [table.shopId, table.customerId], foreignColumns: [customers.shopId, customers.id], name: 'orders_customer_fk' }).onDelete('restrict'),
  uniqueIndex('orders_shop_number_unique').on(table.shopId, table.number),
  // The target of the lines' and events' composite foreign keys.
  uniqueIndex('orders_shop_id_id_unique').on(table.shopId, table.id),
  // Status tabs and Today, newest first.
  index('orders_shop_status_created_idx').on(table.shopId, table.status, table.createdAt),
  // The full list, newest first; a customer's orders.
  index('orders_shop_created_idx').on(table.shopId, table.createdAt),
  index('orders_shop_customer_idx').on(table.shopId, table.customerId, table.createdAt),
  check('orders_status_check', sql`${table.status} in (${inList(ORDER_STATUSES)})`),
  check('orders_payment_status_check', sql`${table.paymentStatus} in (${inList(PAYMENT_STATUSES)})`),
  check('orders_currency_check', sql`${table.currency} in ('KHR', 'USD')`),
  check('orders_total_check', sql`${table.total} >= 0`),
  check('orders_number_check', sql`${table.number} >= 1`),
  // Paid means a payment time; unpaid means none.
  check('orders_paid_at_check', sql`(${table.paymentStatus} = 'paid') = (${table.paidAt} is not null)`),
])

export const orderLines = sqliteTable('order_lines', {
  id: text().primaryKey(),
  shopId: shopId(),
  orderId: text().notNull(),
  /** Where the line was priced from; `null` if that item is ever gone (a safety net: items are archived). */
  priceItemId: text().references(() => priceItems.id, { onDelete: 'set null' }),
  serviceNameEn: text().notNull(),
  serviceNameKm: text(),
  itemNameEn: text().notNull(),
  itemNameKm: text(),
  unit: text({ enum: PRICE_UNITS }).notNull(),
  /** Pieces, or grams for a per-kg item (spec T13). */
  quantity: integer().notNull(),
  unitPrice: integer().notNull(),
  lineTotal: integer().notNull(),
  sort: integer().notNull(),
}, table => [
  foreignKey({ columns: [table.shopId, table.orderId], foreignColumns: [orders.shopId, orders.id], name: 'order_lines_order_fk' }).onDelete('cascade'),
  index('order_lines_order_idx').on(table.shopId, table.orderId, table.sort),
  check('order_lines_unit_check', sql`${table.unit} in ('piece', 'kg')`),
  check('order_lines_quantity_check', sql`${table.quantity} >= 1`),
  check('order_lines_amounts_check', sql`${table.unitPrice} >= 0 and ${table.lineTotal} >= 0`),
])

/** An order's history (spec §6): one row per action, in the action's batch. Append-only. */
export const orderEvents = sqliteTable('order_events', {
  id: text().primaryKey(),
  shopId: shopId(),
  orderId: text().notNull(),
  type: text({ enum: ORDER_EVENT_TYPES }).notNull(),
  /** Plain text, no FK, like the audit trail. */
  actorUserId: text().notNull(),
  data: text({ mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: timestamp().notNull().default(nowMs),
}, table => [
  foreignKey({ columns: [table.shopId, table.orderId], foreignColumns: [orders.shopId, orders.id], name: 'order_events_order_fk' }).onDelete('cascade'),
  index('order_events_order_idx').on(table.shopId, table.orderId, table.createdAt),
  check('order_events_type_check', sql`${table.type} in (${inList(ORDER_EVENT_TYPES)})`),
])
