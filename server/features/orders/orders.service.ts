import type { Page } from '#shared/contracts/common'
import { toPage } from '#shared/contracts/common'
import type { CollectOrderInput, CreateOrderInput, Order, OrderAction, OrderActionInput, OrderListQuery, OrderStatus, OrderSummary, TodayOverview, UpdateOrderInput } from '#shared/contracts/orders'
import { ORDER_STAGES, ORDER_TRANSITIONS, TODAY_LIST_SIZE } from '#shared/contracts/orders'
import type { Db, Statement } from '#server/utils/batch'
import { isStaleWrite, isUniqueViolation, requireOneChange } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { shopDate, startOfShopDay } from '#server/utils/time'
import { auditStatement, runIdempotent } from '#server/features/platform'
import { counterCustomer, getCustomer, phoneSearchDigits, requireActiveCustomerStatement } from '#server/features/customers'
import { priceItemsForLines, requireActivePriceItemsStatement } from '#server/features/pricing'
import { getSettings } from '#server/features/shops'
import { queueOrderMessagesStatement, queueReminderStatement } from '#server/features/notifications'
import type { ShopActor } from '#server/features/identity'
import { alreadyPaid, cancelledNoPayment, customerUnavailable, invalidLines, invalidTransition, orderChanged, orderNotEditable, orderNotFound, orderPaid, orderUnpaid, priceItemUnavailable } from './orders.errors'
import * as repo from './orders.repository'
import type { EventRow, LineRow, OrderRow, OrderSummaryRow } from './orders.repository'
import type { LineSnapshot } from './orders.rules'
import { canRecordPayment, canTransition, isEditable, keepsLines, orderTotal, quantityError, requantify, snapshotLine } from './orders.rules'

/**
 * A shop's orders (spec §7, §8.1, §9, step M2.3). Every query is the actor's shop's; another shop's
 * order answers 404 like a missing one. Each write is one batch: the change at the version read,
 * its guards, the order event and, where it applies, the audit row and the idempotency key. When a
 * guard stops the batch, `explain` reads why, so the answer names the real reason.
 */

/** Events shown on an order: plenty for any real order's life. */
const EVENTS_SHOWN = 100

const iso = (date: Date | null) => date?.toISOString() ?? null

function toSummary(row: OrderSummaryRow): OrderSummary {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    paymentStatus: row.paymentStatus,
    total: row.total,
    currency: row.currency,
    customer: { id: row.customerId, name: row.customerName, phone: row.customerPhone, anonymized: row.customerAnonymizedAt !== null },
    createdAt: row.createdAt.toISOString(),
    readyAt: iso(row.readyAt),
    version: row.version,
  }
}

function toOrder(row: OrderRow, lines: LineRow[], events: EventRow[]): Order {
  return {
    ...toSummary(row),
    note: row.note,
    paidAt: iso(row.paidAt),
    collectedAt: iso(row.collectedAt),
    cancelledAt: iso(row.cancelledAt),
    lines,
    events: events.map(event => ({ ...event, createdAt: event.createdAt.toISOString() })),
  }
}

// --- Reads ---

export function getOrder(db: Db, actor: ShopActor, id: string): Promise<Order> {
  return orderInShop(db, actor.shopId, id)
}

/**
 * The shop's order, for work that runs without a signed-in user (the receipt sent on Telegram,
 * D28): the caller holds the shop's id from a trusted place (a link, a queued message), never
 * from a request. Another shop's order is 404, as in `getOrder`.
 */
export async function orderInShop(db: Db, shopId: string, id: string): Promise<Order> {
  const { order, lines, events } = await repo.orderDetail(db, shopId, id, EVENTS_SHOWN)
  if (!order) throw orderNotFound()
  return toOrder(order, lines, events)
}

/** A search of only digits may be an order number (`61`), digits of a phone, or both. */
function numberSearch(search: string): number | undefined {
  return /^\d{1,9}$/.test(search) ? Number(search) : undefined
}

export async function listOrders(db: Db, actor: ShopActor, query: OrderListQuery): Promise<Page<OrderSummary>> {
  const { status, stage, payment, search, customerId, page, pageSize } = query
  const { rows, total } = await repo.listOrders(db, actor.shopId, {
    status,
    statuses: stage ? ORDER_STAGES[stage] : undefined,
    payment,
    customerId,
    text: search,
    phoneDigits: search ? phoneSearchDigits(search) : undefined,
    number: search ? numberSearch(search) : undefined,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  })
  return toPage(rows.map(toSummary), query, total)
}

export async function getToday(db: Db, actor: ShopActor, now = new Date()): Promise<TodayOverview> {
  const { byStatus, unpaid, createdToday, collectedToday, ready, unpaidRows } = await repo.today(db, actor.shopId, { since: startOfShopDay(now), limit: TODAY_LIST_SIZE })
  const inStatus = (status: OrderStatus) => byStatus.find(row => row.status === status)?.total ?? 0
  return {
    counts: { received: inStatus('received'), inProgress: inStatus('in_progress'), ready: inStatus('ready'), unpaid, createdToday, collectedToday },
    ready: ready.map(toSummary),
    unpaid: unpaidRows.map(toSummary),
  }
}

// --- Writes ---

type Explain = () => Promise<Error>

async function run(db: Db, statements: Statement[], explain: Explain): Promise<void> {
  try {
    await db.batch(statements as [Statement, ...Statement[]])
  }
  catch (error) {
    if (isStaleWrite(error)) throw await explain()
    throw error
  }
}

function event(db: Db, actor: ShopActor, orderId: string, type: Parameters<typeof repo.insertEventStatement>[1]['type'], now: Date, data?: Record<string, unknown>): Statement {
  return repo.insertEventStatement(db, { shopId: actor.shopId, orderId, type, actorUserId: actor.userId, data, now })
}

/** The order at the version the caller read, or 404 / 409 `VERSION_CONFLICT`. */
async function orderAt(db: Db, shopId: string, id: string, version: number): Promise<OrderRow> {
  const order = await repo.findOrder(db, shopId, id)
  if (!order) throw orderNotFound()
  if (order.version !== version) throw orderChanged()
  return order
}

/**
 * Snapshots of new lines from the shop's active price items, or a field error per line that
 * can't be priced. `paths[i]` names line `i`'s fields in the request (`lines.2`).
 */
async function priceNewLines(db: Db, shopId: string, lines: { priceItemId: string, quantity: number, path: string }[]): Promise<Map<string, LineSnapshot>> {
  const ids = [...new Set(lines.map(line => line.priceItemId))]
  const items = new Map((await priceItemsForLines(db, shopId, ids)).map(item => [item.id, item]))
  const unavailable = lines.filter(line => items.get(line.priceItemId)?.status !== 'active').map(line => `${line.path}.priceItemId`)
  if (unavailable.length) throw priceItemUnavailable(unavailable)
  const snapshots = new Map<string, LineSnapshot>()
  const errors: Record<string, string[]> = {}
  for (const line of lines) {
    const snapshot = snapshotLine(items.get(line.priceItemId)!, line.quantity)
    const problem = quantityError(snapshot.unit, line.quantity)
    if (problem) errors[`${line.path}.quantity`] = [problem]
    snapshots.set(line.path, snapshot)
  }
  if (Object.keys(errors).length) throw invalidLines(errors)
  return snapshots
}

/** The customer is the shop's and not anonymized. */
async function isActiveCustomer(db: Db, actor: ShopActor, id: string): Promise<boolean> {
  try {
    return !(await getCustomer(db, actor, id)).anonymized
  }
  catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) return false
    throw error
  }
}

/**
 * The order's customer and the statements that make or guard them in the order's batch: one
 * chosen already (still the shop's and not anonymized), or the person at the counter (D27).
 */
async function orderCustomer(db: Db, actor: ShopActor, input: CreateOrderInput, now: Date): Promise<{ id: string, statements: Statement[] }> {
  const { customer } = input
  if (customer.kind === 'counter') return counterCustomer(db, actor, customer, now)
  if (!await isActiveCustomer(db, actor, customer.id)) throw customerUnavailable()
  return { id: customer.id, statements: [requireActiveCustomerStatement(db, actor.shopId, customer.id)] }
}

/** Why a new order's batch stopped: its customer was anonymized, or a price archived, meanwhile. */
function explainCreate(db: Db, actor: ShopActor, input: CreateOrderInput, customerId: string): Explain {
  return async () => {
    if (!await isActiveCustomer(db, actor, customerId)) return customerUnavailable()
    const ids = [...new Set(input.lines.map(line => line.priceItemId))]
    const active = new Set((await priceItemsForLines(db, actor.shopId, ids)).filter(item => item.status === 'active').map(item => item.id))
    return priceItemUnavailable(input.lines.flatMap((line, index) => (active.has(line.priceItemId) ? [] : [`lines.${index}.priceItemId`])))
  }
}

/**
 * Creates an order (spec §8.1): the next number, the lines priced from the shop's active price
 * list, the total computed here (the client's is never read), paid at drop-off if asked. At most
 * once per `Idempotency-Key`: a repeat answers with the same order (`replayed`). Its ticket comes
 * with M3 (D24).
 */
export async function createOrder(db: Db, actor: ShopActor, input: CreateOrderInput, key: string, now = new Date()): Promise<{ order: Order, replayed: boolean }> {
  const { shopId } = actor
  const { id, replayed } = await runIdempotent(db, {
    scope: { shopId, actorUserId: actor.userId, action: 'order.create', key },
    request: input,
    now,
    perform: async (keyStatement) => {
      const once = async () => {
        const customer = await orderCustomer(db, actor, input, now)
        const priced = await priceNewLines(db, shopId, input.lines.map((line, index) => ({ ...line, path: `lines.${index}` })))
        const lines = [...priced.values()]
        const total = orderTotal(lines)
        const { currency } = await getSettings(db, actor)
        const orderId = newId()
        await run(db, [
          ...customer.statements,
          requireActivePriceItemsStatement(db, shopId, [...new Set(input.lines.map(line => line.priceItemId))]),
          repo.nextNumberStatement(db, shopId),
          repo.insertOrderStatement(db, { shopId, id: orderId, customerId: customer.id, total, currency, note: input.note, paid: input.paid, createdBy: actor.userId, now }),
          ...repo.insertLinesStatements(db, { shopId, orderId }, lines),
          event(db, actor, orderId, 'created', now, { lines: lines.length, total, currency }),
          ...(input.paid ? [event(db, actor, orderId, 'payment_recorded', now, { amount: total, currency })] : []),
          keyStatement(orderId),
        ], explainCreate(db, actor, input, customer.id))
        return orderId
      }
      try {
        return await once()
      }
      catch (error) {
        // Another order made this phone's customer meanwhile: it exists now, so this one uses it.
        // (A key used twice at once fails again here, and runIdempotent answers with the winner.)
        if (isUniqueViolation(error) && input.customer.kind === 'counter' && input.customer.phone) return once()
        throw error
      }
    },
  })
  return { order: await getOrder(db, actor, id), replayed }
}

/** Why an order's guarded write stopped: gone, changed, or no longer in a status that allows it. */
function explainOrder(db: Db, shopId: string, id: string, version: number, rule: (order: OrderRow) => Error | undefined): Explain {
  return async () => {
    const current = await repo.findOrder(db, shopId, id)
    if (!current) return orderNotFound()
    if (current.version !== version) return orderChanged()
    return rule(current) ?? orderChanged()
  }
}

/**
 * Edits the lines and the note while the order is received or in progress (spec P6). Kept lines
 * (`lineId`) keep their names and price; new ones (`priceItemId`) are priced now. The total is
 * recomputed here. A paid order's lines can't change (D24).
 */
export async function updateOrder(db: Db, actor: ShopActor, id: string, input: UpdateOrderInput, now = new Date()): Promise<Order> {
  const { shopId } = actor
  const order = await orderAt(db, shopId, id, input.version)
  if (!isEditable(order.status)) throw orderNotEditable()
  const before = await repo.linesOf(db, shopId, id)
  if (order.paymentStatus === 'paid' && !keepsLines(before, input.lines)) throw orderPaid()

  const existing = new Map(before.map(line => [line.id, line]))
  const missing: Record<string, string[]> = {}
  const fresh: { priceItemId: string, quantity: number, path: string }[] = []
  input.lines.forEach((line, index) => {
    if ('lineId' in line && !existing.has(line.lineId)) missing[`lines.${index}.lineId`] = ['This line is no longer on the order']
    if ('priceItemId' in line) fresh.push({ ...line, path: `lines.${index}` })
  })
  if (Object.keys(missing).length) throw invalidLines(missing)
  const priced = await priceNewLines(db, shopId, fresh)
  const lines = input.lines.map((line, index) => ('lineId' in line
    ? { ...requantify(existing.get(line.lineId)!, line.quantity), id: line.lineId }
    : priced.get(`lines.${index}`)!))
  const total = orderTotal(lines)
  const fields = [...(keepsLines(before, input.lines) ? [] : ['lines']), ...(order.note === input.note ? [] : ['note'])]

  const newIds = [...new Set(fresh.map(line => line.priceItemId))]
  await run(db, [
    repo.updateOrderStatement(db, { shopId, id, version: input.version }, { set: { total, note: input.note }, from: ['received', 'in_progress'], now }),
    requireOneChange(db),
    ...(newIds.length ? [requireActivePriceItemsStatement(db, shopId, newIds)] : []),
    repo.deleteLinesStatement(db, { shopId, orderId: id }),
    ...repo.insertLinesStatements(db, { shopId, orderId: id }, lines),
    event(db, actor, id, 'updated', now, { fields, total }),
  ], explainOrder(db, shopId, id, input.version, current => (isEditable(current.status) ? priceItemUnavailable(fresh.map(line => `${line.path}.priceItemId`)) : orderNotEditable())))
  return getOrder(db, actor, id)
}

const EVENT_OF: Record<OrderAction, 'started' | 'ready' | 'rework' | 'collected' | 'cancelled'> = {
  start: 'started',
  ready: 'ready',
  rework: 'rework',
  collect: 'collected',
  cancel: 'cancelled',
}

interface TransitionOptions {
  action: Exclude<OrderAction, 'collect'>
  input: OrderActionInput
  now?: Date
}

/**
 * Moves the order along the state machine (spec §7): start, ready, rework, cancel. Collect has its
 * own function (the payment rule). Cancelling is owner-only and audited; cancelling a paid order
 * notes it, refunds are outside the system (Phase 1).
 */
export async function transitionOrder(db: Db, actor: ShopActor, id: string, options: TransitionOptions): Promise<Order> {
  const { action, input, now = new Date() } = options
  const { shopId } = actor
  const order = await orderAt(db, shopId, id, input.version)
  if (!canTransition(order.status, action)) throw invalidTransition(action)
  const { from, to } = ORDER_TRANSITIONS[action]
  const set = {
    status: to,
    ...(action === 'ready' ? { readyAt: now } : {}),
    ...(action === 'rework' ? { readyAt: null } : {}),
    ...(action === 'cancel' ? { cancelledAt: now } : {}),
  }
  const data = action === 'cancel' ? { from: order.status, paidBeforeCancel: order.paymentStatus === 'paid' } : { from: order.status }
  await run(db, [
    repo.updateOrderStatement(db, { shopId, id, version: input.version }, { set, from, now }),
    requireOneChange(db),
    event(db, actor, id, EVENT_OF[action], now, data),
    // Ready: the customer's linked chats hear it (D28). A ready after a rework is a new message.
    ...(action === 'ready' ? [queueOrderMessagesStatement(db, { shopId, orderId: id, customerId: order.customerId, kind: 'ready', key: String(input.version + 1) }, now)] : []),
    ...(action === 'cancel' ? [auditStatement(db, { userId: actor.userId, shopId, requestId: actor.requestId }, { action: 'order.cancel', targetType: 'order', targetId: id, data }, now)] : []),
  ], explainOrder(db, shopId, id, input.version, current => (canTransition(current.status, action) ? undefined : invalidTransition(action))))
  return getOrder(db, actor, id)
}

/** Hands the order over (spec §8.4). Unpaid needs `allowUnpaid`: the app asks the owner first. */
export async function collectOrder(db: Db, actor: ShopActor, id: string, input: CollectOrderInput, now = new Date()): Promise<Order> {
  const { shopId } = actor
  const order = await orderAt(db, shopId, id, input.version)
  if (!canTransition(order.status, 'collect')) throw invalidTransition('collect')
  if (order.paymentStatus !== 'paid' && !input.allowUnpaid) throw orderUnpaid()
  const { from, to } = ORDER_TRANSITIONS.collect
  await run(db, [
    repo.updateOrderStatement(db, { shopId, id, version: input.version }, { set: { status: to, collectedAt: now }, from, now }),
    requireOneChange(db),
    event(db, actor, id, 'collected', now, { from: order.status, unpaid: order.paymentStatus !== 'paid' }),
    queueOrderMessagesStatement(db, { shopId, orderId: id, customerId: order.customerId, kind: 'collected', key: String(input.version + 1) }, now),
  ], explainOrder(db, shopId, id, input.version, (current) => {
    if (!canTransition(current.status, 'collect')) return invalidTransition('collect')
    return current.paymentStatus !== 'paid' && !input.allowUnpaid ? orderUnpaid() : undefined
  }))
  return getOrder(db, actor, id)
}

function paymentRefusal(order: OrderRow): Error | undefined {
  if (order.status === 'cancelled') return cancelledNoPayment()
  if (order.paymentStatus === 'paid') return alreadyPaid()
  return undefined
}

/**
 * Records the full payment of the order's total (spec §8.4): one payment per order in Phase 1, at
 * any status but cancelled. At most once per `Idempotency-Key`: a repeat answers with the order
 * as it is now and records nothing.
 */
export async function recordPayment(db: Db, actor: ShopActor, id: string, input: OrderActionInput, key: string, now = new Date()): Promise<{ order: Order, replayed: boolean }> {
  const { shopId } = actor
  const result = await runIdempotent(db, {
    scope: { shopId, actorUserId: actor.userId, action: 'order.payment', key },
    request: { id, ...input },
    now,
    perform: async (keyStatement) => {
      const order = await orderAt(db, shopId, id, input.version)
      const refusal = canRecordPayment(order.status, order.paymentStatus) ? undefined : paymentRefusal(order)
      if (refusal) throw refusal
      await run(db, [
        repo.updateOrderStatement(db, { shopId, id, version: input.version }, {
          set: { paymentStatus: 'paid', paidAt: now },
          from: ['received', 'in_progress', 'ready', 'collected'],
          now,
        }),
        requireOneChange(db),
        event(db, actor, id, 'payment_recorded', now, { amount: order.total, currency: order.currency }),
        keyStatement(id),
      ], explainOrder(db, shopId, id, input.version, paymentRefusal))
      return id
    },
  })
  return { order: await getOrder(db, actor, result.id), replayed: result.replayed }
}

// --- Reminders (spec §8.5) ---

/** Orders read and queued per round: one batch each. */
const REMINDER_ROUND = 50

/**
 * Queues today's reminder for every order ready for at least its shop's `reminderAfterDays`, to
 * the chats linked to it: once a day, three in all per chat (the outbox's keys and cap). Safe to
 * run twice a day or to overlap. Returns how many orders were looked at.
 */
export async function queueReminders(db: Db, now = new Date()): Promise<number> {
  const day = shopDate(now)
  let afterId: string | undefined
  let seen = 0
  while (true) {
    const rows = await repo.ordersToRemind(db, { now, limit: REMINDER_ROUND, afterId })
    if (!rows.length) return seen
    const statements = rows.map(row => queueReminderStatement(db, { shopId: row.shopId, orderId: row.id, customerId: row.customerId, day }, now))
    await db.batch(statements as [Statement, ...Statement[]])
    seen += rows.length
    afterId = rows.at(-1)!.id
  }
}
