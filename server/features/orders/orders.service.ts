import type { Page } from '#shared/contracts/common'
import { toPage } from '#shared/contracts/common'
import type { CreateOrderInput, OrderActionInput, OrderDetail, OrderListItem, OrderListQuery } from '#shared/contracts/orders'
import { toE164 } from '#shared/contracts/phone'
import { checkFill, cleanValues } from '#shared/slip/values'
import type { Db, Statement } from '#server/utils/batch'
import { requireOneChange, runBatch } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { shopDate } from '#server/utils/time'
import { auditStatement, runIdempotent } from '#server/features/platform'
import type { ShopActor } from '#server/features/identity'
import { shopCopy } from '#server/features/shops'
import { orderableVersion, orderableVersionGuards, templateChangedForOrder, versionImage, versionsById } from '#server/features/templates'
import { orderChanged, orderNotAllowed, orderNotFound, slipValuesInvalid } from './orders.errors'
import * as repo from './orders.repository'
import { canDo, parseOrderSearch } from './orders.rules'
import type { OrderAction } from './orders.rules'
import type { OrderRow } from './orders.repository'

/**
 * The shop's orders (plan §3 steps 4–5, §4, step 3): a filled slip, numbered by the shop. The shop
 * and the person come from the actor; the number, the day and the template version are the
 * server's; every value is checked against the version the order is made on (plan §6.8).
 */

function toListItem(row: OrderRow): OrderListItem {
  const { id, number, date, phone, amount, paid, status, createdAt } = row
  return { id, number, date, phone, amount, currency: row.shop.currency, paid, status, createdAt: createdAt.toISOString() }
}

const iso = (date: Date | null) => date?.toISOString() ?? null

export async function getOrder(db: Db, actor: ShopActor, orderId: string): Promise<OrderDetail> {
  const row = await repo.findOrder(db, actor.shopId, orderId)
  if (!row) throw orderNotFound()
  const version = (await versionsById(db, [row.templateVersionId])).get(row.templateVersionId)
  // The version is restricted from deletion while an order uses it (data-model → template_versions).
  if (!version) throw orderNotFound()
  return {
    ...toListItem(row),
    templateId: version.templateId,
    templateVersionId: row.templateVersionId,
    templateVersionNumber: version.number,
    templateName: version.templateName,
    design: version.design,
    values: row.values,
    shop: row.shop,
    version: row.version,
    paidAt: iso(row.paidAt),
    pickedUpAt: iso(row.pickedUpAt),
    cancelledAt: iso(row.cancelledAt),
  }
}

/**
 * The shop's orders, newest first. `search` is an exact order number or phone (`parseOrderSearch`);
 * text that is neither matches nothing.
 */
export async function listOrders(db: Db, actor: ShopActor, query: OrderListQuery): Promise<Page<OrderListItem>> {
  const { search, status, paid, page, pageSize } = query
  const wanted = search ? parseOrderSearch(search) : undefined
  if (wanted && 'none' in wanted) return toPage([], query, 0)
  const { rows, total } = await repo.listOrders(db, actor.shopId, { ...wanted, status, paid, page, pageSize })
  return toPage(rows.map(toListItem), query, total)
}

interface CreateOrderOptions {
  input: CreateOrderInput
  /** The `Idempotency-Key` header. */
  key: string
  now?: Date
}

/**
 * Saves a filled slip as a new order, at most once per idempotency key: a double tap or a retry
 * answers with the first order (`replayed`), whatever happened to the template since.
 *
 * - The version must be the latest of a template attached to the shop (404, or 409 `TEMPLATE_CHANGED`).
 * - Every value must fit it (422 `SLIP_VALUES_INVALID`, by field); only its keys are stored.
 * - One batch: the guards that the template is still attached and not published again, the
 *   counter, the order (numbered from the counter), the audit row and the idempotency key.
 */
export async function createOrder(db: Db, actor: ShopActor, options: CreateOrderOptions): Promise<{ order: OrderDetail, replayed: boolean }> {
  const { input, key, now = new Date() } = options
  const { shopId, userId } = actor
  const { id, replayed } = await runIdempotent(db, {
    scope: { shopId, actorUserId: userId, action: 'order.create', key },
    request: input,
    now,
    perform: async (keyStatement) => {
      const version = await orderableVersion(db, shopId, input.templateVersionId)
      const { values, phone, amount, paid } = input
      const problems = checkFill(version.design, { values, phone, amount, paid })
      if (Object.keys(problems).length) throw slipValuesInvalid(problems)
      const shop = await shopCopy(db, shopId)
      if (!shop) throw orderNotFound()
      const orderId = newId()
      await runBatch(db, [
        ...orderableVersionGuards(db, shopId, version),
        repo.raiseCounterStatement(db, shopId),
        repo.insertOrderStatement(db, {
          id: orderId,
          shopId,
          date: shopDate(now),
          templateVersionId: version.versionId,
          values: cleanValues(version.design, values),
          shop,
          phone: phone ? toE164(phone) : null,
          amount,
          paid,
          userId,
          now,
        }),
        auditStatement(db, { userId, shopId, requestId: actor.requestId }, { action: 'order.create', targetType: 'order', targetId: orderId, data: { templateVersionId: version.versionId, paid } }, now),
        keyStatement(orderId),
      ], templateChangedForOrder)
      return orderId
    },
  })
  return { order: await getOrder(db, actor, id), replayed }
}

/** An image the order's slip draws (its artwork), for the order page and its reprint. */
export async function orderImage(db: Db, actor: ShopActor, options: { orderId: string, imageId: string }) {
  const { orderId, imageId } = options
  const row = await repo.findOrder(db, actor.shopId, orderId)
  if (!row) throw orderNotFound()
  return versionImage(db, { versionId: row.templateVersionId, imageId })
}

// --- Actions on a saved order (plan §3 step 7, §4) ---

interface ActionOptions {
  orderId: string
  input: OrderActionInput
  now?: Date
}

const STATEMENTS = { 'pay': repo.payStatement, 'pick-up': repo.pickUpStatement, 'cancel': repo.cancelStatement } as const

/**
 * One action at the version read: 404 for no such order (or another shop's), 409 `INVALID_STATE`
 * when the order's state doesn't allow it, 409 `VERSION_CONFLICT` when it changed meanwhile. One
 * batch: the guarded change and its audit row (`paid` recorded, so an unpaid handoff says who and when).
 */
async function act(db: Db, actor: ShopActor, action: OrderAction, options: ActionOptions & { extra?: Statement[] }): Promise<string> {
  const { orderId, input, now = new Date(), extra = [] } = options
  const { shopId, userId } = actor
  const order = await repo.findOrder(db, shopId, orderId)
  if (!order) throw orderNotFound()
  if (!canDo(action, order)) throw orderNotAllowed(action)
  await runBatch(db, [
    STATEMENTS[action](db, { shopId, id: orderId, version: input.version, now }),
    requireOneChange(db),
    auditStatement(db, { userId, shopId, requestId: actor.requestId }, { action: `order.${action}`, targetType: 'order', targetId: orderId, data: { paid: order.paid, status: order.status } }, now),
    ...extra,
  ], orderChanged)
  return orderId
}

/**
 * Marks the order paid, at most once per idempotency key (architecture → Idempotency): a retry or
 * a double tap answers with the order as it is now. Paid while open, or after an unpaid pickup.
 */
export async function markPaid(db: Db, actor: ShopActor, options: ActionOptions & { key: string }): Promise<{ order: OrderDetail, replayed: boolean }> {
  const { orderId, input, key, now = new Date() } = options
  const { id, replayed } = await runIdempotent(db, {
    scope: { shopId: actor.shopId, actorUserId: actor.userId, action: 'order.pay', key },
    request: { orderId, ...input },
    now,
    perform: keyStatement => act(db, actor, 'pay', { orderId, input, now, extra: [keyStatement(orderId)] }),
  })
  return { order: await getOrder(db, actor, id), replayed }
}

/** The customer took the bag. Allowed unpaid (the app asks first); the audit row records it. */
export async function pickUpOrder(db: Db, actor: ShopActor, options: ActionOptions): Promise<OrderDetail> {
  return getOrder(db, actor, await act(db, actor, 'pick-up', options))
}

/** Cancels an open order (never deleted, plan §4). A paid order stays paid: its record is kept. */
export async function cancelOrder(db: Db, actor: ShopActor, options: ActionOptions): Promise<OrderDetail> {
  return getOrder(db, actor, await act(db, actor, 'cancel', options))
}

// --- For the slip sent on Telegram (plan step 4) ---

/**
 * What the customer's picture is drawn from, for a message already queued: the order's version, its
 * values and its shop copy. No actor: the caller holds the order from the outbox, which names its
 * shop. `undefined` when there's no such order of that shop.
 */
export async function orderSlip(db: Db, order: { shopId: string, orderId: string }) {
  const row = await repo.findOrder(db, order.shopId, order.orderId)
  if (!row) return undefined
  const version = (await versionsById(db, [row.templateVersionId])).get(row.templateVersionId)
  if (!version) return undefined
  return {
    number: row.number,
    status: row.status,
    design: version.design,
    data: { values: row.values, order: { number: row.number, date: row.date, phone: row.phone, amount: row.amount, paid: row.paid }, shop: row.shop },
  }
}
