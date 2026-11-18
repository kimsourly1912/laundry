import type { CreatePriceInput, PriceItem, UpdatePriceInput } from '#shared/contracts/prices'
import type { Db } from '#server/utils/batch'
import { isUniqueViolation, requireOneChange, runBatch } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { auditStatement } from '#server/features/platform'
import type { ShopActor } from '#server/features/identity'
import { shopCopy } from '#server/features/shops'
import { priceAlready, priceChanged, priceKeyTaken, priceNotFound } from './prices.errors'
import * as repo from './prices.repository'
import type { PriceRow } from './prices.repository'

/**
 * The shop's price list (D39; product notes → price list). Prices are in the shop's currency; an
 * order copies each line's price when it's saved, so changing one never changes an old order.
 * Items are archived, never deleted (an order's lines point at them).
 */

async function currencyOf(db: Db, shopId: string) {
  return (await shopCopy(db, shopId))?.currency ?? 'KHR'
}

export async function listPrices(db: Db, actor: ShopActor): Promise<PriceItem[]> {
  const [rows, currency] = await Promise.all([repo.listPrices(db, actor.shopId), currencyOf(db, actor.shopId)])
  return rows.map(row => ({ ...row, currency }))
}

async function priceOf(db: Db, actor: ShopActor, priceId: string): Promise<PriceItem> {
  const [row, currency] = await Promise.all([repo.findPrice(db, actor.shopId, priceId), currencyOf(db, actor.shopId)])
  if (!row) throw priceNotFound()
  return { ...row, currency }
}

/** A new item; 409 `PRICE_KEY_TAKEN` when the shop has the key already (archived ones too). */
export async function createPrice(db: Db, actor: ShopActor, input: CreatePriceInput, now = new Date()): Promise<PriceItem> {
  const { shopId, userId } = actor
  const id = newId()
  try {
    await db.batch([
      repo.insertPriceStatement(db, { id, shopId, ...input, now }),
      auditStatement(db, { userId, shopId, requestId: actor.requestId }, { action: 'price.create', targetType: 'price', targetId: id, data: { key: input.key, price: input.price } }, now),
    ])
  }
  catch (error) {
    if (isUniqueViolation(error)) throw priceKeyTaken()
    throw error
  }
  return priceOf(db, actor, id)
}

/** Label, unit and price at the version read (409 when stale). */
export async function updatePrice(db: Db, actor: ShopActor, priceId: string, input: UpdatePriceInput, now = new Date()): Promise<PriceItem> {
  const { shopId, userId } = actor
  const { version, ...set } = input
  const before = await repo.findPrice(db, shopId, priceId)
  if (!before) throw priceNotFound()
  await runBatch(db, [
    repo.updatePriceStatement(db, { shopId, id: priceId, version, set, now }),
    requireOneChange(db),
    auditStatement(db, { userId, shopId, requestId: actor.requestId }, { action: 'price.update', targetType: 'price', targetId: priceId, data: { from: before.price, to: set.price, unit: set.unit } }, now),
  ], priceChanged)
  return priceOf(db, actor, priceId)
}

/** Archive (no new order is priced by it) or bring back, at the version read. */
export async function setPriceActive(db: Db, actor: ShopActor, priceId: string, input: { version: number, active: boolean }, now = new Date()): Promise<PriceItem> {
  const { shopId, userId } = actor
  const before = await repo.findPrice(db, shopId, priceId)
  if (!before) throw priceNotFound()
  if (before.active === input.active) throw priceAlready(input.active)
  await runBatch(db, [
    repo.updatePriceStatement(db, { shopId, id: priceId, version: input.version, set: { active: input.active }, now }),
    requireOneChange(db),
    auditStatement(db, { userId, shopId, requestId: actor.requestId }, { action: input.active ? 'price.restore' : 'price.archive', targetType: 'price', targetId: priceId }, now),
  ], priceChanged)
  return priceOf(db, actor, priceId)
}

/** For an order (orders feature): the shop's active items by key. */
export async function activePrices(db: Db, shopId: string, keys: readonly string[]): Promise<Map<string, PriceRow>> {
  const rows = await repo.activePricesByKey(db, shopId, keys)
  return new Map(rows.map(row => [row.key, row]))
}
