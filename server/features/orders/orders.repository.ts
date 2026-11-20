import { and, count, desc, eq, ne, sql } from 'drizzle-orm'
import type { OrderListQuery, OrderStage, OrderStatus } from '#shared/contracts/orders'
import type { SlipValues } from '#shared/contracts/slip-design'
import type { Db, Statement } from '#server/utils/batch'
import { updateAtVersion } from '#server/utils/batch'
import { firstRow } from '#server/utils/query'
import { orderCounters, orders } from './orders.schema'
import type { OrderShopCopy } from './orders.schema'

/**
 * The shop's orders and their counter (data-model → orders). Shop-owned: every function takes the
 * shop's id and filters by it, so another shop's order is never found.
 */

// --- Reads ---

const orderColumns = {
  id: orders.id,
  number: orders.number,
  date: orders.date,
  templateVersionId: orders.templateVersionId,
  values: orders.values,
  shop: orders.shop,
  customerId: orders.customerId,
  customerName: orders.customerName,
  dueDate: orders.dueDate,
  phone: orders.phone,
  amount: orders.amount,
  paid: orders.paid,
  status: orders.status,
  stage: orders.stage,
  paidAt: orders.paidAt,
  readyAt: orders.readyAt,
  pickedUpAt: orders.pickedUpAt,
  cancelledAt: orders.cancelledAt,
  version: orders.version,
  createdAt: orders.createdAt,
}

export interface OrderRow {
  id: string
  number: number
  date: string
  templateVersionId: string
  values: SlipValues
  shop: OrderShopCopy
  customerId: string | null
  customerName: string | null
  dueDate: string | null
  phone: string | null
  amount: number | null
  paid: boolean
  status: OrderStatus
  stage: OrderStage
  paidAt: Date | null
  readyAt: Date | null
  pickedUpAt: Date | null
  cancelledAt: Date | null
  version: number
  createdAt: Date
}

export function findOrder(db: Db, shopId: string, orderId: string): Promise<OrderRow | undefined> {
  return firstRow(db.select(orderColumns).from(orders).where(and(eq(orders.shopId, shopId), eq(orders.id, orderId))))
}

export interface OrderFilter {
  /** Exact: the unique `(shop_id, number)` index. */
  number?: number
  /** Exact E.164 (`orders_shop_phone_idx`): one phone may have several orders. */
  phone?: string
  status?: OrderStatus
  stage?: OrderStage
  paid?: boolean
}

/** The shop's orders, newest first (`orders_shop_created_idx`), filtered, a page at a time, with how many match. */
export async function listOrders(db: Db, shopId: string, query: OrderFilter & Pick<OrderListQuery, 'page' | 'pageSize'>): Promise<{ rows: OrderRow[], total: number }> {
  const { page, pageSize, number, phone, status, stage, paid } = query
  const where = and(
    eq(orders.shopId, shopId),
    number === undefined ? undefined : eq(orders.number, number),
    phone === undefined ? undefined : eq(orders.phone, phone),
    status === undefined ? undefined : eq(orders.status, status),
    stage === undefined ? undefined : eq(orders.stage, stage),
    paid === undefined ? undefined : eq(orders.paid, paid),
  )
  const [rows, [counted]] = await db.batch([
    db.select(orderColumns).from(orders).where(where).orderBy(desc(orders.createdAt), desc(orders.id)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(orders).where(where),
  ])
  return { rows, total: counted?.total ?? 0 }
}

/** Overview's counts in one pass over the shop's orders. */
export async function overviewCounts(db: Db, shopId: string, today: string) {
  const [row] = await db.select({
    receivedToday: sql<number>`coalesce(sum(case when ${orders.date} = ${today} then 1 else 0 end), 0)`,
    inProgress: sql<number>`coalesce(sum(case when ${orders.status} = 'open' and ${orders.stage} = 'in_progress' then 1 else 0 end), 0)`,
    ready: sql<number>`coalesce(sum(case when ${orders.status} = 'open' and ${orders.stage} = 'ready' then 1 else 0 end), 0)`,
    unpaid: sql<number>`coalesce(sum(case when ${orders.paid} = 0 and ${orders.status} <> 'cancelled' then 1 else 0 end), 0)`,
  }).from(orders).where(eq(orders.shopId, shopId))
  return { receivedToday: Number(row?.receivedToday ?? 0), inProgress: Number(row?.inProgress ?? 0), ready: Number(row?.ready ?? 0), unpaid: Number(row?.unpaid ?? 0) }
}

// --- Write statements ---

/** Raises the shop's counter by one (the first order makes its row): the next statement reads it. */
export function raiseCounterStatement(db: Db, shopId: string): Statement {
  return db.insert(orderCounters).values({ shopId, lastNumber: 1 })
    .onConflictDoUpdate({ target: orderCounters.shopId, set: { lastNumber: sql`${orderCounters.lastNumber} + 1` } })
}

interface NewOrder {
  id: string
  shopId: string
  date: string
  templateVersionId: string
  values: SlipValues
  shop: OrderShopCopy
  customer: { id: string, name: string } | null
  dueDate: string | null
  phone: string | null
  amount: number | null
  paid: boolean
  userId: string
  now: Date
}

/**
 * The order, numbered from the shop's counter as raised by `raiseCounterStatement` just before it
 * in the same batch: two orders at once never share a number (architecture → Atomic writes).
 */
export function insertOrderStatement(db: Db, order: NewOrder): Statement {
  const { id, shopId, date, templateVersionId, values, shop, customer, dueDate, phone, amount, paid, userId, now } = order
  return db.insert(orders).values({
    id,
    shopId,
    number: sql`(select ${orderCounters.lastNumber} from ${orderCounters} where ${orderCounters.shopId} = ${shopId})`,
    date,
    templateVersionId,
    values,
    shop,
    customerId: customer?.id ?? null,
    customerName: customer?.name ?? null,
    dueDate,
    phone,
    amount,
    paid,
    paidAt: paid ? now : null,
    status: 'open',
    version: 1,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  })
}

interface OrderChange {
  shopId: string
  id: string
  version: number
  now: Date
}

/**
 * The action's change at the version read, only from the states it is allowed in (the same rule as
 * `canDo`, again in SQL, so a change landing in between stops it). Follow with `requireOneChange`.
 */
export function payStatement(db: Db, change: OrderChange): Statement {
  const { now, ...key } = change
  return updateAtVersion(db, orders, key, { paid: true, paidAt: now, updatedAt: now }, and(eq(orders.paid, false), ne(orders.status, 'cancelled')))
}

export function pickUpStatement(db: Db, change: OrderChange): Statement {
  const { now, ...key } = change
  return updateAtVersion(db, orders, key, { status: 'picked_up', pickedUpAt: now, updatedAt: now }, and(eq(orders.status, 'open'), eq(orders.stage, 'ready')))
}

export function cancelStatement(db: Db, change: OrderChange): Statement {
  const { now, ...key } = change
  return updateAtVersion(db, orders, key, { status: 'cancelled', cancelledAt: now, updatedAt: now }, eq(orders.status, 'open'))
}

export function startStatement(db: Db, change: OrderChange): Statement {
  const { now, ...key } = change
  return updateAtVersion(db, orders, key, { stage: 'in_progress', updatedAt: now }, and(eq(orders.status, 'open'), eq(orders.stage, 'received')))
}

export function readyStatement(db: Db, change: OrderChange): Statement {
  const { now, ...key } = change
  return updateAtVersion(db, orders, key, { stage: 'ready', readyAt: now, updatedAt: now }, and(eq(orders.status, 'open'), ne(orders.stage, 'ready')))
}

export function reworkStatement(db: Db, change: OrderChange): Statement {
  const { now, ...key } = change
  return updateAtVersion(db, orders, key, { stage: 'in_progress', updatedAt: now }, and(eq(orders.status, 'open'), eq(orders.stage, 'ready')))
}
