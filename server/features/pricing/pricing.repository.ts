import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { PriceStatus, PriceUnit } from '#shared/contracts/pricing'
import type { Db, Statement } from '#server/utils/batch'
import { insertAll, requireAtMost, requireCount, updateAtVersion } from '#server/utils/batch'
import { firstRow } from '#server/utils/query'
import { priceItems, serviceTypes } from './pricing.schema'

// --- Reads (every one scoped to the shop) ---

const serviceTypeColumns = { id: serviceTypes.id, nameEn: serviceTypes.nameEn, nameKm: serviceTypes.nameKm, sort: serviceTypes.sort, status: serviceTypes.status, version: serviceTypes.version }
const priceItemColumns = { id: priceItems.id, serviceTypeId: priceItems.serviceTypeId, nameEn: priceItems.nameEn, nameKm: priceItems.nameKm, unit: priceItems.unit, price: priceItems.price, sort: priceItems.sort, status: priceItems.status, version: priceItems.version }

/** The shop's service types in one status, in list order. Bounded by the active cap (D22). */
export function listServiceTypes(db: Db, shopId: string, status: PriceStatus) {
  return db.select(serviceTypeColumns).from(serviceTypes)
    .where(and(eq(serviceTypes.shopId, shopId), eq(serviceTypes.status, status)))
    .orderBy(asc(serviceTypes.sort), asc(serviceTypes.nameEn))
}

export type ServiceTypeRow = Awaited<ReturnType<typeof listServiceTypes>>[number]

export function findServiceType(db: Db, shopId: string, id: string) {
  return firstRow(db.select(serviceTypeColumns).from(serviceTypes).where(and(eq(serviceTypes.shopId, shopId), eq(serviceTypes.id, id))))
}

export function listPriceItems(db: Db, shopId: string, status: PriceStatus) {
  return db.select(priceItemColumns).from(priceItems)
    .where(and(eq(priceItems.shopId, shopId), eq(priceItems.status, status)))
    .orderBy(asc(priceItems.sort), asc(priceItems.nameEn))
}

export type PriceItemRow = Awaited<ReturnType<typeof listPriceItems>>[number]

export function findPriceItem(db: Db, shopId: string, id: string) {
  return firstRow(db.select(priceItemColumns).from(priceItems).where(and(eq(priceItems.shopId, shopId), eq(priceItems.id, id))))
}

const activeTypes = (shopId: string) => and(eq(serviceTypes.shopId, shopId), eq(serviceTypes.status, 'active'))
const activeItems = (shopId: string) => and(eq(priceItems.shopId, shopId), eq(priceItems.status, 'active'))
const activeItemsOfType = (shopId: string, serviceTypeId: string) => and(activeItems(shopId), eq(priceItems.serviceTypeId, serviceTypeId))
const activeType = (shopId: string, id: string) => and(activeTypes(shopId), eq(serviceTypes.id, id))

export function countActiveServiceTypes(db: Db, shopId: string): Promise<number> {
  return db.$count(serviceTypes, activeTypes(shopId))
}

export function countActivePriceItems(db: Db, shopId: string): Promise<number> {
  return db.$count(priceItems, activeItems(shopId))
}

export function countActiveItemsOfType(db: Db, shopId: string, serviceTypeId: string): Promise<number> {
  return db.$count(priceItems, activeItemsOfType(shopId, serviceTypeId))
}

export async function isActiveServiceType(db: Db, shopId: string, id: string): Promise<boolean> {
  return (await db.$count(serviceTypes, activeType(shopId, id))) === 1
}

export async function hasPriceItems(db: Db, shopId: string): Promise<boolean> {
  return (await db.$count(priceItems, eq(priceItems.shopId, shopId))) > 0
}

/**
 * The shop's price items among `ids`, with their service type's names: what an order's lines copy
 * (spec §16). Any status: the caller decides. At most `MAX_ORDER_LINES` ids, under D1's limit.
 */
export function priceItemsForLines(db: Db, shopId: string, ids: readonly string[]) {
  return db.select({
    id: priceItems.id,
    nameEn: priceItems.nameEn,
    nameKm: priceItems.nameKm,
    serviceNameEn: serviceTypes.nameEn,
    serviceNameKm: serviceTypes.nameKm,
    unit: priceItems.unit,
    price: priceItems.price,
    status: priceItems.status,
  }).from(priceItems)
    .innerJoin(serviceTypes, and(eq(serviceTypes.shopId, priceItems.shopId), eq(serviceTypes.id, priceItems.serviceTypeId)))
    .where(and(eq(priceItems.shopId, shopId), inArray(priceItems.id, [...ids])))
}

// --- Guards (abort the batch) ---

/** Every one of `ids` (distinct) is an active price item of the shop: none was archived meanwhile. */
export function requireActivePriceItems(db: Db, shopId: string, ids: readonly string[]): Statement {
  return requireCount(db, sql`${db.$count(priceItems, and(activeItems(shopId), inArray(priceItems.id, [...ids])))}`, ids.length)
}

/** At most `max` active service types once the batch's earlier statements ran. */
export function requireServiceTypesAtMost(db: Db, shopId: string, max: number): Statement {
  return requireAtMost(db, sql`${db.$count(serviceTypes, activeTypes(shopId))}`, max)
}

export function requirePriceItemsAtMost(db: Db, shopId: string, max: number): Statement {
  return requireAtMost(db, sql`${db.$count(priceItems, activeItems(shopId))}`, max)
}

/** The service type is the shop's and active (the composite foreign key covers "the shop's"; this, "active"). */
export function requireActiveServiceType(db: Db, shopId: string, serviceTypeId: string): Statement {
  return requireCount(db, sql`${db.$count(serviceTypes, activeType(shopId, serviceTypeId))}`, 1)
}

/** No active price item uses the service type (archiving it). */
export function requireNoActiveItemsOfType(db: Db, shopId: string, serviceTypeId: string): Statement {
  return requireCount(db, sql`${db.$count(priceItems, activeItemsOfType(shopId, serviceTypeId))}`, 0)
}

/** The shop has no price item at all, archived included (changing the currency, D22). */
export function requireNoPriceItems(db: Db, shopId: string): Statement {
  return requireCount(db, sql`${db.$count(priceItems, eq(priceItems.shopId, shopId))}`, 0)
}

// --- Write statements ---

/** Next in list order: after the shop's last one, computed in the insert itself. */
function nextSort(table: typeof serviceTypes | typeof priceItems, shopId: string) {
  return sql<number>`(select coalesce(max(${table.sort}), 0) + 1 from ${table} where ${table.shopId} = ${shopId})`
}

interface Names {
  nameEn: string
  nameKm: string | null
}

interface VersionKey {
  shopId: string
  id: string
  version: number
}

interface NewServiceType extends Names {
  shopId: string
  id: string
  now: Date
}

export function insertServiceTypeStatement(db: Db, row: NewServiceType): Statement {
  const { shopId, id, nameEn, nameKm, now } = row
  return db.insert(serviceTypes).values({ id, shopId, nameEn, nameKm, sort: nextSort(serviceTypes, shopId), createdAt: now, updatedAt: now })
}

/** Renames an active service type at `version`. Follow with `requireOneChange`. */
export function updateServiceTypeStatement(db: Db, key: VersionKey, names: Names, now: Date): Statement {
  return updateAtVersion(db, serviceTypes, key, { ...names, updatedAt: now }, eq(serviceTypes.status, 'active'))
}

export function archiveServiceTypeStatement(db: Db, key: VersionKey, now: Date): Statement {
  return updateAtVersion(db, serviceTypes, key, { status: 'archived', updatedAt: now }, eq(serviceTypes.status, 'active'))
}

interface ItemFields extends Names {
  serviceTypeId: string
  unit: PriceUnit
  price: number
}

interface NewPriceItem extends ItemFields {
  shopId: string
  id: string
  now: Date
}

/**
 * A whole new price list in slip order (a shop made from a template, D25): the rows carry their
 * own `sort`, in pieces under D1's parameter limit. Service types before their items (the FK).
 */
export function insertPriceListStatements(db: Db, list: { types: (typeof serviceTypes.$inferInsert)[], items: (typeof priceItems.$inferInsert)[] }): Statement[] {
  return [...insertAll(db, serviceTypes, list.types), ...insertAll(db, priceItems, list.items)]
}

export function insertPriceItemStatement(db: Db, row: NewPriceItem): Statement {
  const { shopId, id, now, ...fields } = row
  return db.insert(priceItems).values({ id, shopId, ...fields, sort: nextSort(priceItems, shopId), createdAt: now, updatedAt: now })
}

export function updatePriceItemStatement(db: Db, key: VersionKey, fields: ItemFields, now: Date): Statement {
  return updateAtVersion(db, priceItems, key, { ...fields, updatedAt: now }, eq(priceItems.status, 'active'))
}

export function archivePriceItemStatement(db: Db, key: VersionKey, now: Date): Statement {
  return updateAtVersion(db, priceItems, key, { status: 'archived', updatedAt: now }, eq(priceItems.status, 'active'))
}
