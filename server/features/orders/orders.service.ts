import type { Page } from '#shared/contracts/common'
import { toPage } from '#shared/contracts/common'
import type { CreateOrderInput, OrderPreviewInput, OrderDetail, OrderListItem, OrderListQuery, PaperDraft } from '#shared/contracts/orders'
import { checkFill, cleanValues } from '#shared/slip/values'
import type { Db } from '#server/utils/batch'
import { runBatch } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { shopDate } from '#server/utils/time'
import { auditStatement, runIdempotent } from '#server/features/platform'
import type { ShopActor } from '#server/features/identity'
import { shopCopy } from '#server/features/shops'
import { orderCustomer } from '#server/features/customers'
import type { SlipData } from '#shared/contracts/slip-design'
import { orderableVersion, orderableVersionGuards, renderFilledPaperDraft, renderFilledSlipSvg, templateChangedForOrder, versionImage, versionsById } from '#server/features/templates'
import { dueDateInPast, orderNotFound, slipValuesInvalid } from './orders.errors'
import * as repo from './orders.repository'
import { parseOrderSearch } from './orders.rules'
import type { OrderRow } from './orders.repository'

/**
 * The shop's orders (plan §3 steps 4–5, §4, step 3): a filled slip, numbered by the shop. The shop
 * and the person come from the actor; the number, the day and the template version are the
 * server's; every value is checked against the version the order is made on (plan §6.8).
 */

function toListItem(row: OrderRow): OrderListItem {
  const { id, number, date, customerName, dueDate, phone, amount, paid, status, stage, createdAt } = row
  return { id, number, date, customerName, dueDate, phone, amount, currency: row.shop.currency, paid, status, stage, createdAt: createdAt.toISOString() }
}

const iso = (date: Date | null) => date?.toISOString() ?? null

export async function getOrder(db: Db, actor: ShopActor, orderId: string): Promise<OrderDetail> {
  const row = await repo.findOrder(db, actor.shopId, orderId)
  if (!row) throw orderNotFound()
  const versions = await versionsById(db, [row.templateVersionId])
  const version = versions.get(row.templateVersionId)
  // The version is restricted from deletion while an order uses it (data-model → template_versions).
  if (!version) throw orderNotFound()
  return {
    ...toListItem(row),
    customerId: row.customerId,
    templateId: version.templateId,
    templateVersionId: row.templateVersionId,
    templateVersionNumber: version.number,
    templateName: version.templateName,
    design: version.design,
    values: row.values,
    shop: row.shop,
    version: row.version,
    paidAt: iso(row.paidAt),
    readyAt: iso(row.readyAt),
    pickedUpAt: iso(row.pickedUpAt),
    cancelledAt: iso(row.cancelledAt),
  }
}

/**
 * The shop's orders, newest first. `search` is an exact order number or phone (`parseOrderSearch`);
 * text that is neither matches nothing.
 */
export async function listOrders(db: Db, actor: ShopActor, query: OrderListQuery): Promise<Page<OrderListItem>> {
  const { search, page, pageSize } = query
  const wanted = search ? parseOrderSearch(search) : undefined
  if (wanted && 'none' in wanted) return toPage([], query, 0)
  const { rows, total } = await repo.listOrders(db, actor.shopId, { ...wanted, page, pageSize })
  return toPage(rows.map(toListItem), query, total)
}

interface CreateOrderOptions {
  /** The validated request; `customerId` and `dueDate` may be left out (a walk-in, no promised day). */
  input: Omit<CreateOrderInput, 'customerId' | 'dueDate'> & { customerId?: string | null, dueDate?: string | null }
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
  const { key, now = new Date() } = options
  const input = { ...options.input, customerId: options.input.customerId ?? null, dueDate: options.input.dueDate ?? null }
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
      if (input.dueDate && input.dueDate < shopDate(now)) throw dueDateInPast()
      const shop = await shopCopy(db, shopId)
      if (!shop) throw orderNotFound()
      // The shop's own customer only (404 otherwise); customers are never deleted, so no guard is needed in the batch.
      const customer = input.customerId ? await orderCustomer(db, shopId, input.customerId) : null
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
          customer,
          dueDate: input.dueDate,
          phone: phone || null,
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

// --- For the slip sent on Telegram (plan step 4) ---

/**
 * What the customer's picture is drawn from, for a message already queued: the order's version, its
 * values and its shop copy. No actor: the caller holds the order from the outbox, which names its
 * shop. `undefined` when there's no such order of that shop.
 */
export async function orderSlip(db: Db, order: { shopId: string, orderId: string }) {
  const row = await repo.findOrder(db, order.shopId, order.orderId)
  if (!row) return undefined
  const versions = await versionsById(db, [row.templateVersionId])
  const version = versions.get(row.templateVersionId)
  if (!version) return undefined
  return {
    number: row.number,
    status: row.status,
    design: version.design,
    data: {
      values: row.values,
      order: { number: row.number, date: row.date, phone: row.phone, amount: row.amount, paid: row.paid, customerName: row.customerName, dueDate: row.dueDate, qrUrl: null },
      shop: row.shop,
    } satisfies SlipData,
  }
}

/** The same saved slip artwork used for the preview and Telegram. */
export async function orderSlipSvg(db: Db, actor: ShopActor, options: { orderId: string }): Promise<string> {
  const slip = await orderSlip(db, { shopId: actor.shopId, orderId: options.orderId })
  if (!slip) throw orderNotFound()
  return renderFilledSlipSvg(db, slip)
}

/**
 * The owner’s editable HTML slip (D47): the draft drawn by the server as it will be saved,
 * with no number yet. Nothing is stored. Values that don't fit are drawn as
 * they are; saving checks them.
 */
export async function previewOrderDraft(db: Db, actor: ShopActor, input: OrderPreviewInput, now = new Date()): Promise<PaperDraft> {
  const { shopId } = actor
  const version = await orderableVersion(db, shopId, input.templateVersionId)
  const shop = await shopCopy(db, shopId)
  if (!shop) throw orderNotFound()
  const values = cleanValues(version.design, input.values)
  const customer = input.customerId ? await orderCustomer(db, shopId, input.customerId) : null
  return renderFilledPaperDraft(db, {
    design: version.design,
    data: {
      values,
      order: { number: null, date: shopDate(now), phone: input.phone || null, amount: input.amount, paid: input.paid, customerName: customer?.name ?? null, dueDate: input.dueDate, qrUrl: null },
      shop,
    },
  })
}
