import type { Page } from '#shared/contracts/common'
import { toPage } from '#shared/contracts/common'
import type { CreateOrderInput, OrderDetail, OrderListItem, OrderListQuery } from '#shared/contracts/orders'
import { toE164 } from '#shared/contracts/phone'
import { checkFill, cleanValues } from '#shared/slip/values'
import type { Db } from '#server/utils/batch'
import { runBatch } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { shopDate } from '#server/utils/time'
import { auditStatement, runIdempotent } from '#server/features/platform'
import type { ShopActor } from '#server/features/identity'
import { shopCopy } from '#server/features/shops'
import { orderableVersion, orderableVersionGuards, templateChangedForOrder, versionImage, versionsById } from '#server/features/templates'
import { orderNotFound, slipValuesInvalid } from './orders.errors'
import * as repo from './orders.repository'
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

export async function listOrders(db: Db, actor: ShopActor, query: OrderListQuery): Promise<Page<OrderListItem>> {
  const { rows, total } = await repo.listOrders(db, actor.shopId, query)
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
