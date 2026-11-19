import type { PriceList, PriceStatus, SetPriceInput, ShopPrice } from '#shared/contracts/prices'
import { missingPrices } from '#shared/contracts/prices'
import type { SlipPrice } from '#shared/html-slip/items'
import { slipPrices } from '#shared/html-slip/items'
import type { Db } from '#server/utils/batch'
import { isUniqueViolation, requireOneChange, runBatch } from '#server/utils/batch'
import { notFound } from '#server/utils/errors'
import { newId } from '#server/utils/ids'
import { auditStatement } from '#server/features/platform'
import type { ShopActor } from '#server/features/identity'
import { shopCopy } from '#server/features/shops'
import { shopSlipDesigns } from '#server/features/templates'
import { priceChanged, priceNotFound } from './prices.errors'
import * as repo from './prices.repository'
import type { PriceRow } from './prices.repository'

/**
 * The shop's prices (D43): the shop's attached slips decide what is priced, and the owner sets only
 * how much. The name and the unit (per piece or per kg) come from the item list, never from the
 * client. An order copies each line's price when it's saved, so a change never changes an old order.
 * Items are never deleted: an order's lines point at them.
 */

/** A row's price as the list shows it: an archived row (before D43) or one in another unit counts as unset. */
function priceOf(row: PriceRow | undefined, unit: SlipPrice['unit']): number | null {
  return row && row.active && row.unit === unit ? row.price : null
}

async function pricesOf(db: Db, shopId: string): Promise<ShopPrice[]> {
  const [designs, rows] = await Promise.all([shopSlipDesigns(db, shopId), repo.listPrices(db, shopId)])
  const byKey = new Map(rows.map(row => [row.key, row]))
  const onSlip = slipPrices(designs).map((item): ShopPrice => {
    const row = byKey.get(item.key)
    return { ...item, price: priceOf(row, item.unit), version: row?.version ?? null, onSlip: true }
  })
  const slipKeys = new Set(onSlip.map(item => item.key))
  // Kept for old orders: priced before, no longer on any slip.
  const kept = rows
    .filter(row => row.active && !slipKeys.has(row.key))
    .map((row): ShopPrice => ({ key: row.key, label: row.label, unit: row.unit, price: row.price, version: row.version, onSlip: false }))
  return [...onSlip, ...kept]
}

export async function listPrices(db: Db, actor: ShopActor): Promise<PriceList> {
  const [items, shop] = await Promise.all([pricesOf(db, actor.shopId), shopCopy(db, actor.shopId)])
  return { currency: shop?.currency ?? 'KHR', items }
}

/**
 * The price of an item on the shop's slips, at the version read (null: it has none yet). A key that
 * isn't on the shop's slips is 404, as a missing one. The first price makes the shop's item; a later
 * one changes it. Either way the name and unit are the item list's, and an archived item (before
 * D43) is in use again. Two first prices at once: the second is 409, as a stale version.
 */
export async function setPrice(db: Db, actor: ShopActor, key: string, input: SetPriceInput, now = new Date()): Promise<ShopPrice> {
  const { shopId, userId } = actor
  const item = slipPrices(await shopSlipDesigns(db, shopId)).find(entry => entry.key === key)
  if (!item) throw priceNotFound()
  const before = await repo.findPriceByKey(db, shopId, key)
  const audit = (targetId: string) => auditStatement(db, { userId, shopId, requestId: actor.requestId }, { action: 'price.set', targetType: 'price', targetId, data: { key, from: priceOf(before, item.unit), to: input.price } }, now)
  if (!before) {
    if (input.version !== null) throw priceChanged()
    const id = newId()
    try {
      await db.batch([repo.insertPriceStatement(db, { id, shopId, key, label: item.label, unit: item.unit, price: input.price, now }), audit(id)])
    }
    catch (error) {
      if (isUniqueViolation(error)) throw priceChanged()
      throw error
    }
    return { ...item, price: input.price, version: 1, onSlip: true }
  }
  if (input.version === null) throw priceChanged()
  await runBatch(db, [
    repo.updatePriceStatement(db, { shopId, id: before.id, version: input.version, set: { label: item.label, unit: item.unit, price: input.price, active: true }, now }),
    requireOneChange(db),
    audit(before.id),
  ], priceChanged)
  return { ...item, price: input.price, version: input.version + 1, onSlip: true }
}

/** For the platform's shop page (D43): how many of the slips' prices are set, never the amounts. */
export async function priceStatus(db: Db, shopId: string): Promise<PriceStatus> {
  if (!(await shopCopy(db, shopId))) throw notFound('The shop')
  const items = await pricesOf(db, shopId)
  const needed = items.filter(item => item.onSlip).length
  return { needed, set: needed - missingPrices({ items }).length }
}

/** For an order (orders feature): the shop's active items by key. */
export async function activePrices(db: Db, shopId: string, keys: readonly string[]): Promise<Map<string, PriceRow>> {
  const rows = await repo.activePricesByKey(db, shopId, keys)
  return new Map(rows.map(row => [row.key, row]))
}
