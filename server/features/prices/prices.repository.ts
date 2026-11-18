import { and, asc, eq, inArray } from 'drizzle-orm'
import type { PriceUnit } from '#shared/contracts/prices'
import type { Db, Statement } from '#server/utils/batch'
import { updateAtVersion } from '#server/utils/batch'
import { firstRow } from '#server/utils/query'
import { priceItems } from './prices.schema'

/** The shop's price list (data-model → price_items): every function takes the shop and filters by it. */

const priceColumns = {
  id: priceItems.id,
  key: priceItems.key,
  label: priceItems.label,
  unit: priceItems.unit,
  price: priceItems.price,
  active: priceItems.active,
  version: priceItems.version,
}

export interface PriceRow {
  id: string
  key: string
  label: string
  unit: PriceUnit
  price: number
  active: boolean
  version: number
}

/** The whole list (a shop has tens of items), active first, by label. */
export function listPrices(db: Db, shopId: string): Promise<PriceRow[]> {
  return db.select(priceColumns).from(priceItems).where(eq(priceItems.shopId, shopId)).orderBy(asc(priceItems.label), asc(priceItems.key))
}

export function findPrice(db: Db, shopId: string, priceId: string): Promise<PriceRow | undefined> {
  return firstRow(db.select(priceColumns).from(priceItems).where(and(eq(priceItems.shopId, shopId), eq(priceItems.id, priceId))))
}

/** The shop's active items for these keys. */
export function activePricesByKey(db: Db, shopId: string, keys: readonly string[]): Promise<PriceRow[]> {
  if (!keys.length) return Promise.resolve([])
  return db.select(priceColumns).from(priceItems).where(and(eq(priceItems.shopId, shopId), eq(priceItems.active, true), inArray(priceItems.key, [...keys])))
}

export function insertPriceStatement(db: Db, item: { id: string, shopId: string, key: string, label: string, unit: PriceUnit, price: number, now: Date }): Statement {
  const { id, shopId, key, label, unit, price, now } = item
  return db.insert(priceItems).values({ id, shopId, key, label, unit, price, active: true, version: 1, createdAt: now, updatedAt: now })
}

export function updatePriceStatement(db: Db, change: { shopId: string, id: string, version: number, set: Partial<{ label: string, unit: PriceUnit, price: number, active: boolean }>, now: Date }): Statement {
  const { shopId, id, version, set, now } = change
  return updateAtVersion(db, priceItems, { shopId, id, version }, { ...set, updatedAt: now })
}
