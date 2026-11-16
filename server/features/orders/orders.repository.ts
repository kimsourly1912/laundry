import { and, asc, count, desc, eq, gte, inArray, ne, or, sql } from 'drizzle-orm'
import type { OrderEventType, OrderStatus, PaymentStatus } from '#shared/contracts/orders'
import type { Db, Statement } from '#server/utils/batch'
import { insertAll, updateAtVersion } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { containsText, firstRow } from '#server/utils/query'
import { user } from '#server/db/tables'
import { customersTable as customers } from '#server/features/customers'
import { orderCounters, orderEvents, orderLines, orders } from './orders.schema'
import type { LineSnapshot } from './orders.rules'

// --- Reads (every one scoped to the shop) ---

// The order with its customer's display columns: a read-only join allowed by
// docs/server/repositories.md → Other features' tables.
const summaryColumns = {
  id: orders.id,
  number: orders.number,
  status: orders.status,
  paymentStatus: orders.paymentStatus,
  total: orders.total,
  currency: orders.currency,
  createdAt: orders.createdAt,
  readyAt: orders.readyAt,
  version: orders.version,
  customerId: customers.id,
  customerName: customers.name,
  customerPhone: customers.phoneE164,
  customerAnonymizedAt: customers.anonymizedAt,
}

const detailColumns = {
  ...summaryColumns,
  note: orders.note,
  paidAt: orders.paidAt,
  collectedAt: orders.collectedAt,
  cancelledAt: orders.cancelledAt,
}

const withCustomer = and(eq(customers.shopId, orders.shopId), eq(customers.id, orders.customerId))

function selectSummaries(db: Db) {
  return db.select(summaryColumns).from(orders).innerJoin(customers, withCustomer)
}

const selectOrder = (db: Db, shopId: string, id: string) =>
  db.select(detailColumns).from(orders).innerJoin(customers, withCustomer).where(and(eq(orders.shopId, shopId), eq(orders.id, id))).limit(1)

export function findOrder(db: Db, shopId: string, id: string) {
  return firstRow(db.select(detailColumns).from(orders).innerJoin(customers, withCustomer).where(and(eq(orders.shopId, shopId), eq(orders.id, id))))
}

export type OrderRow = NonNullable<Awaited<ReturnType<typeof findOrder>>>

const lineColumns = {
  id: orderLines.id,
  priceItemId: orderLines.priceItemId,
  serviceNameEn: orderLines.serviceNameEn,
  serviceNameKm: orderLines.serviceNameKm,
  itemNameEn: orderLines.itemNameEn,
  itemNameKm: orderLines.itemNameKm,
  unit: orderLines.unit,
  quantity: orderLines.quantity,
  unitPrice: orderLines.unitPrice,
  lineTotal: orderLines.lineTotal,
}

/** The order's lines in their order. At most `MAX_ORDER_LINES`. */
export function linesOf(db: Db, shopId: string, orderId: string) {
  return db.select(lineColumns).from(orderLines).where(and(eq(orderLines.shopId, shopId), eq(orderLines.orderId, orderId))).orderBy(asc(orderLines.sort))
}

export type LineRow = Awaited<ReturnType<typeof linesOf>>[number]

/** The order's history, newest first, with who did each (the user's name: an allowed join). */
export function eventsOf(db: Db, shopId: string, orderId: string, limit: number) {
  return db.select({ id: orderEvents.id, type: orderEvents.type, actorName: user.name, data: orderEvents.data, createdAt: orderEvents.createdAt })
    .from(orderEvents)
    .leftJoin(user, eq(user.id, orderEvents.actorUserId))
    .where(and(eq(orderEvents.shopId, shopId), eq(orderEvents.orderId, orderId)))
    .orderBy(desc(orderEvents.createdAt), desc(orderEvents.id))
    .limit(limit)
}

export type EventRow = Awaited<ReturnType<typeof eventsOf>>[number]

/** The order, its lines and its newest events, in one batch (one snapshot). */
export async function orderDetail(db: Db, shopId: string, id: string, eventLimit: number) {
  const [[order], lines, events] = await db.batch([selectOrder(db, shopId, id), linesOf(db, shopId, id), eventsOf(db, shopId, id, eventLimit)])
  return { order, lines, events }
}

interface ListFilter {
  status?: OrderStatus
  /** Any of these (a board tab, D27). */
  statuses?: readonly OrderStatus[]
  payment?: PaymentStatus
  /** A customer's name, any part. */
  text?: string
  /** Digits found inside the customer's E.164 phone. */
  phoneDigits?: string
  /** An exact order number. */
  number?: number
  customerId?: string
  limit: number
  offset: number
}

/** The shop's orders, newest first, a page at a time; a search matches the number, phone or name. */
export async function listOrders(db: Db, shopId: string, filter: ListFilter) {
  const { status, statuses, payment, text, phoneDigits, number, customerId, limit, offset } = filter
  const where = and(
    eq(orders.shopId, shopId),
    status ? eq(orders.status, status) : undefined,
    statuses ? inArray(orders.status, [...statuses]) : undefined,
    payment ? eq(orders.paymentStatus, payment) : undefined,
    customerId ? eq(orders.customerId, customerId) : undefined,
    text
      ? or(
          containsText(customers.name, text),
          phoneDigits ? sql`instr(${customers.phoneE164}, ${phoneDigits}) > 0` : undefined,
          number ? eq(orders.number, number) : undefined,
        )
      : undefined,
  )
  const [rows, [counted]] = await db.batch([
    selectSummaries(db).where(where).orderBy(desc(orders.createdAt), desc(orders.id)).limit(limit).offset(offset),
    db.select({ total: count() }).from(orders).innerJoin(customers, withCustomer).where(where),
  ])
  return { rows, total: counted?.total ?? 0 }
}

const unpaid = (shopId: string) => and(eq(orders.shopId, shopId), eq(orders.paymentStatus, 'unpaid'), ne(orders.status, 'cancelled'))
const countOf = (db: Db, where: ReturnType<typeof and>) => db.select({ total: count() }).from(orders).where(where)

/**
 * What Today shows, in one batch (one snapshot): the count per status, unpaid, made and collected
 * since `since` (the shop's midnight), and the two lists: ready (waiting longest first) and unpaid
 * (oldest first).
 */
export async function today(db: Db, shopId: string, options: { since: Date, limit: number }) {
  const { since, limit } = options
  const [byStatus, [unpaidCount], [created], [collected], ready, unpaidRows] = await db.batch([
    db.select({ status: orders.status, total: count() }).from(orders).where(eq(orders.shopId, shopId)).groupBy(orders.status),
    countOf(db, unpaid(shopId)),
    countOf(db, and(eq(orders.shopId, shopId), gte(orders.createdAt, since))),
    countOf(db, and(eq(orders.shopId, shopId), eq(orders.status, 'collected'), gte(orders.collectedAt, since))),
    selectSummaries(db).where(and(eq(orders.shopId, shopId), eq(orders.status, 'ready'))).orderBy(asc(orders.readyAt), asc(orders.id)).limit(limit),
    selectSummaries(db).where(unpaid(shopId)).orderBy(asc(orders.createdAt), asc(orders.id)).limit(limit),
  ])
  return {
    byStatus,
    unpaid: unpaidCount?.total ?? 0,
    createdToday: created?.total ?? 0,
    collectedToday: collected?.total ?? 0,
    ready,
    unpaidRows,
  }
}

export type OrderSummaryRow = Awaited<ReturnType<typeof today>>['ready'][number]

// --- Write statements ---

/** Raises the shop's last order number (the first order makes the row). */
export function nextNumberStatement(db: Db, shopId: string): Statement {
  return db.insert(orderCounters).values({ shopId, lastNumber: 1 })
    .onConflictDoUpdate({ target: orderCounters.shopId, set: { lastNumber: sql`${orderCounters.lastNumber} + 1` } })
}

interface NewOrder {
  shopId: string
  id: string
  customerId: string
  total: number
  currency: 'KHR' | 'USD'
  note: string | null
  paid: boolean
  createdBy: string
  now: Date
}

/** The order, numbered from the counter `nextNumberStatement` raised earlier in the same batch. */
export function insertOrderStatement(db: Db, row: NewOrder): Statement {
  const { shopId, id, customerId, total, currency, note, paid, createdBy, now } = row
  return db.insert(orders).values({
    id,
    shopId,
    number: sql`(select ${orderCounters.lastNumber} from ${orderCounters} where ${orderCounters.shopId} = ${shopId})`,
    customerId,
    total,
    currency,
    note,
    paymentStatus: paid ? 'paid' : 'unpaid',
    paidAt: paid ? now : null,
    createdBy,
    createdAt: now,
    updatedAt: now,
  })
}

/** The order's lines, in pieces under D1's parameter limit. */
export function insertLinesStatements(db: Db, key: { shopId: string, orderId: string }, lines: readonly (LineSnapshot & { id?: string })[]): Statement[] {
  return insertAll(db, orderLines, lines.map((line, index) => ({ ...line, id: line.id ?? newId(), shopId: key.shopId, orderId: key.orderId, sort: index + 1 })))
}

export function deleteLinesStatement(db: Db, key: { shopId: string, orderId: string }): Statement {
  return db.delete(orderLines).where(and(eq(orderLines.shopId, key.shopId), eq(orderLines.orderId, key.orderId)))
}

interface EventRowInput {
  shopId: string
  orderId: string
  type: OrderEventType
  actorUserId: string
  data?: Record<string, unknown>
  now: Date
}

export function insertEventStatement(db: Db, event: EventRowInput): Statement {
  const { shopId, orderId, type, actorUserId, data, now } = event
  return db.insert(orderEvents).values({ id: newId(), shopId, orderId, type, actorUserId, data: data ?? null, createdAt: now })
}

interface VersionKey {
  shopId: string
  id: string
  version: number
}

type OrderSet = Partial<Pick<typeof orders.$inferInsert, 'status' | 'paymentStatus' | 'total' | 'note' | 'readyAt' | 'collectedAt' | 'paidAt' | 'cancelledAt'>>

/**
 * Changes the order at `version`, only while it's in one of `from`. Follow with `requireOneChange`.
 * The version alone stops a stale write (any change raises it); `from` states the rule in the SQL too.
 */
export function updateOrderStatement(db: Db, key: VersionKey, update: { set: OrderSet, from: readonly OrderStatus[], now: Date }): Statement {
  const { set, from, now } = update
  return updateAtVersion(db, orders, key, { ...set, updatedAt: now }, inArray(orders.status, [...from]))
}
