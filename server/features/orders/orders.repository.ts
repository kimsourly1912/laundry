import { and, count, desc, eq, ne, sql } from 'drizzle-orm'
import type { OrderListQuery, OrderStatus } from '#shared/contracts/orders'
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
  phone: orders.phone,
  amount: orders.amount,
  paid: orders.paid,
  status: orders.status,
  paidAt: orders.paidAt,
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
  phone: string | null
  amount: number | null
  paid: boolean
  status: OrderStatus
  paidAt: Date | null
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
  paid?: boolean
}

/** The shop's orders, newest first (`orders_shop_created_idx`), filtered, a page at a time, with how many match. */
export async function listOrders(db: Db, shopId: string, query: OrderFilter & Pick<OrderListQuery, 'page' | 'pageSize'>): Promise<{ rows: OrderRow[], total: number }> {
  const { page, pageSize, number, phone, status, paid } = query
  const where = and(
    eq(orders.shopId, shopId),
    number === undefined ? undefined : eq(orders.number, number),
    phone === undefined ? undefined : eq(orders.phone, phone),
    status === undefined ? undefined : eq(orders.status, status),
    paid === undefined ? undefined : eq(orders.paid, paid),
  )
  const [rows, [counted]] = await db.batch([
    db.select(orderColumns).from(orders).where(where).orderBy(desc(orders.createdAt), desc(orders.id)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(orders).where(where),
  ])
  return { rows, total: counted?.total ?? 0 }
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
  const { id, shopId, date, templateVersionId, values, shop, phone, amount, paid, userId, now } = order
  return db.insert(orders).values({
    id,
    shopId,
    number: sql`(select ${orderCounters.lastNumber} from ${orderCounters} where ${orderCounters.shopId} = ${shopId})`,
    date,
    templateVersionId,
    values,
    shop,
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
  return updateAtVersion(db, orders, key, { status: 'picked_up', pickedUpAt: now, updatedAt: now }, eq(orders.status, 'open'))
}

export function cancelStatement(db: Db, change: OrderChange): Statement {
  const { now, ...key } = change
  return updateAtVersion(db, orders, key, { status: 'cancelled', cancelledAt: now, updatedAt: now }, eq(orders.status, 'open'))
}
