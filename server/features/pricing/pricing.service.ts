import type { PriceItem, PriceItemInput, PriceItemList, PriceListQuery, ServiceType, ServiceTypeInput, ServiceTypeList, UpdatePriceItemInput, UpdateServiceTypeInput } from '#shared/contracts/pricing'
import { MAX_ACTIVE_PRICE_ITEMS, MAX_ACTIVE_SERVICE_TYPES } from '#shared/contracts/pricing'
import type { TemplateDefinition } from '#shared/contracts/templates'
import { templatePriceRows } from '#shared/contracts/templates'
import type { Db, Statement } from '#server/utils/batch'
import { isForeignKeyError, isStaleWrite, readInChunks, requireOneChange } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { auditStatement } from '#server/features/platform'
import type { ShopActor } from '#server/features/identity'
import { alreadyArchived, priceItemChanged, priceItemNotFound, priceListFull, serviceTypeChanged, serviceTypeInUse, serviceTypeNotFound, serviceTypeUnavailable } from './pricing.errors'
import * as repo from './pricing.repository'

/**
 * The shop's price list (spec §9 → Shop, step M2.1). Every query is the actor's shop's; another
 * shop's record answers 404 like a missing one. Each write is one batch: the change, its guards
 * (version, active service type, the caps) and the audit row. A guard that stops the batch is
 * explained afterwards by reading why (`explain`), so the answer names the real reason.
 */

type Explain = () => Promise<Error>

/**
 * Who changes the price list, and in which shop: the shop's own user (the shop from the session),
 * or a super admin acting on a shop named in a platform path (D26), checked by the caller.
 */
export type PriceActor = Pick<ShopActor, 'userId' | 'shopId' | 'requestId'>

/** Runs the batch; when a guard stops it, throws what `explain` finds. */
async function runGuarded(db: Db, statements: Statement[], explain: Explain): Promise<void> {
  try {
    await db.batch(statements as [Statement, ...Statement[]])
  }
  catch (error) {
    if (isStaleWrite(error) || isForeignKeyError(error)) throw await explain()
    throw error
  }
}

function audit(db: Db, actor: PriceActor, action: string, target: { type: string, id: string }, now: Date, data?: Record<string, unknown>): Statement {
  return auditStatement(db, { userId: actor.userId, shopId: actor.shopId, requestId: actor.requestId }, { action, targetType: target.type, targetId: target.id, data }, now)
}

/** Which of `fields` differ between the record and the input: the audit row's `fields`. */
function changedFields<T extends object>(before: T, after: Partial<T>, fields: (keyof T & string)[]): string[] {
  return fields.filter(field => field in after && before[field] !== after[field])
}

// --- Service types ---

export async function listServiceTypes(db: Db, actor: PriceActor, query: PriceListQuery): Promise<ServiceTypeList> {
  return { items: await repo.listServiceTypes(db, actor.shopId, query.status ?? 'active') }
}

export async function createServiceType(db: Db, actor: PriceActor, input: ServiceTypeInput, now = new Date()): Promise<ServiceType> {
  const { shopId } = actor
  const id = newId()
  await runGuarded(db, [
    repo.insertServiceTypeStatement(db, { shopId, id, ...input, now }),
    repo.requireServiceTypesAtMost(db, shopId, MAX_ACTIVE_SERVICE_TYPES),
    audit(db, actor, 'service-type.create', { type: 'service-type', id }, now),
  ], async () => priceListFull(MAX_ACTIVE_SERVICE_TYPES))
  return (await repo.findServiceType(db, shopId, id))!
}

/** Why a service type's guarded write stopped: missing (or another shop's), archived, or changed. */
function explainServiceType(db: Db, shopId: string, id: string, version: number): Explain {
  return async () => {
    const current = await repo.findServiceType(db, shopId, id)
    if (!current) return serviceTypeNotFound()
    if (current.status !== 'active') return alreadyArchived()
    if (current.version !== version) return serviceTypeChanged()
    if (await repo.countActiveItemsOfType(db, shopId, id)) return serviceTypeInUse()
    return serviceTypeChanged()
  }
}

export async function updateServiceType(db: Db, actor: PriceActor, id: string, input: UpdateServiceTypeInput, now = new Date()): Promise<ServiceType> {
  const { shopId } = actor
  const { version, ...names } = input
  const before = await repo.findServiceType(db, shopId, id)
  if (!before) throw serviceTypeNotFound()
  await runGuarded(db, [
    repo.updateServiceTypeStatement(db, { shopId, id, version }, names, now),
    requireOneChange(db),
    audit(db, actor, 'service-type.update', { type: 'service-type', id }, now, { fields: changedFields(before, names, ['nameEn', 'nameKm']) }),
  ], explainServiceType(db, shopId, id, version))
  return (await repo.findServiceType(db, shopId, id))!
}

/** Archives a service type with no active price items (409 `SERVICE_TYPE_IN_USE` otherwise). */
export async function archiveServiceType(db: Db, actor: PriceActor, id: string, version: number, now = new Date()): Promise<ServiceType> {
  const { shopId } = actor
  await runGuarded(db, [
    repo.requireNoActiveItemsOfType(db, shopId, id),
    repo.archiveServiceTypeStatement(db, { shopId, id, version }, now),
    requireOneChange(db),
    audit(db, actor, 'service-type.archive', { type: 'service-type', id }, now),
  ], explainServiceType(db, shopId, id, version))
  return (await repo.findServiceType(db, shopId, id))!
}

// --- Price items ---

export async function listPriceItems(db: Db, actor: PriceActor, query: PriceListQuery): Promise<PriceItemList> {
  return { items: await repo.listPriceItems(db, actor.shopId, query.status ?? 'active') }
}

/** Why a new item's batch stopped: its service type isn't the shop's active one, or the list is full. */
function explainNewItem(db: Db, shopId: string, serviceTypeId: string): Explain {
  return async () => {
    if (!await repo.isActiveServiceType(db, shopId, serviceTypeId)) return serviceTypeUnavailable()
    return priceListFull(MAX_ACTIVE_PRICE_ITEMS)
  }
}

export async function createPriceItem(db: Db, actor: PriceActor, input: PriceItemInput, now = new Date()): Promise<PriceItem> {
  const { shopId } = actor
  const id = newId()
  await runGuarded(db, [
    repo.requireActiveServiceType(db, shopId, input.serviceTypeId),
    repo.insertPriceItemStatement(db, { shopId, id, ...input, now }),
    repo.requirePriceItemsAtMost(db, shopId, MAX_ACTIVE_PRICE_ITEMS),
    audit(db, actor, 'price-item.create', { type: 'price-item', id }, now),
  ], explainNewItem(db, shopId, input.serviceTypeId))
  return (await repo.findPriceItem(db, shopId, id))!
}

function explainPriceItem(db: Db, shopId: string, id: string, version: number, serviceTypeId?: string): Explain {
  return async () => {
    const current = await repo.findPriceItem(db, shopId, id)
    if (!current) return priceItemNotFound()
    if (current.status !== 'active') return alreadyArchived()
    if (current.version !== version) return priceItemChanged()
    if (serviceTypeId && !await repo.isActiveServiceType(db, shopId, serviceTypeId)) return serviceTypeUnavailable()
    return priceItemChanged()
  }
}

/** Changes an item at the version read. A new price applies to new orders only: orders keep their copy (M2.3). */
export async function updatePriceItem(db: Db, actor: PriceActor, id: string, input: UpdatePriceItemInput, now = new Date()): Promise<PriceItem> {
  const { shopId } = actor
  const { version, ...fields } = input
  const before = await repo.findPriceItem(db, shopId, id)
  if (!before) throw priceItemNotFound()
  await runGuarded(db, [
    repo.requireActiveServiceType(db, shopId, fields.serviceTypeId),
    repo.updatePriceItemStatement(db, { shopId, id, version }, fields, now),
    requireOneChange(db),
    audit(db, actor, 'price-item.update', { type: 'price-item', id }, now, { fields: changedFields(before, fields, ['nameEn', 'nameKm', 'serviceTypeId', 'unit', 'price']) }),
  ], explainPriceItem(db, shopId, id, version, fields.serviceTypeId))
  return (await repo.findPriceItem(db, shopId, id))!
}

export async function archivePriceItem(db: Db, actor: PriceActor, id: string, version: number, now = new Date()): Promise<PriceItem> {
  const { shopId } = actor
  await runGuarded(db, [
    repo.archivePriceItemStatement(db, { shopId, id, version }, now),
    requireOneChange(db),
    audit(db, actor, 'price-item.archive', { type: 'price-item', id }, now),
  ], explainPriceItem(db, shopId, id, version))
  return (await repo.findPriceItem(db, shopId, id))!
}

// --- For the shops feature ---

/** Guards a currency change: the shop has no price item, archived included (D22). */
export function requireEmptyPriceListStatement(db: Db, shopId: string): Statement {
  return repo.requireNoPriceItems(db, shopId)
}

export function hasPriceItems(db: Db, shopId: string): Promise<boolean> {
  return repo.hasPriceItems(db, shopId)
}

// --- For the orders feature ---

export type LinePriceItem = Awaited<ReturnType<typeof repo.priceItemsForLines>>[number]

/** The shop's price items among `ids` (any status), with their service type's names, for line snapshots. */
export function priceItemsForLines(db: Db, shopId: string, ids: readonly string[]): Promise<LinePriceItem[]> {
  return ids.length ? repo.priceItemsForLines(db, shopId, ids) : Promise.resolve([])
}

/** Guards an order's new lines: each of the distinct `ids` is still an active price item of the shop. */
export function requireActivePriceItemsStatement(db: Db, shopId: string, ids: readonly string[]): Statement {
  return repo.requireActivePriceItems(db, shopId, ids)
}

/**
 * A new shop's price list, copied from a template's definition (D25), for `createShop`'s batch:
 * every service in the template's order, and in each one its priced items in the template's order.
 * Ids are new; the template's keys stay in the template. No audit row: the shop's creation has one.
 */
export function newPriceListStatements(db: Db, options: { shopId: string, definition: TemplateDefinition, now: Date }): Statement[] {
  const { shopId, definition, now } = options
  const typeIds = new Map(definition.services.map(service => [service.key, newId()]))
  const types = definition.services.map((service, index) => ({
    id: typeIds.get(service.key)!, shopId, nameEn: service.nameEn, nameKm: service.nameKm, sort: index + 1, createdAt: now, updatedAt: now,
  }))
  const items = templatePriceRows(definition).map((row, index) => ({
    id: newId(), shopId, serviceTypeId: typeIds.get(row.serviceKey)!, nameEn: row.nameEn, nameKm: row.nameKm, unit: row.unit, price: row.price, sort: index + 1, createdAt: now, updatedAt: now,
  }))
  return repo.insertPriceListStatements(db, { types, items })
}

// --- For the receipts feature ---

/**
 * Which of the ids are the shop's own price items and service types (any status): a receipt
 * design's fields may name only these (D28). In D1-sized pieces.
 */
export async function shopPriceIds(db: Db, shopId: string, ids: { priceItemIds: readonly string[], serviceTypeIds: readonly string[] }): Promise<{ priceItemIds: Set<string>, serviceTypeIds: Set<string> }> {
  const [items, types] = await Promise.all([
    readInChunks(ids.priceItemIds, piece => repo.priceItemIdsIn(db, shopId, piece)),
    readInChunks(ids.serviceTypeIds, piece => repo.serviceTypeIdsIn(db, shopId, piece)),
  ])
  return { priceItemIds: new Set(items.map(row => row.id)), serviceTypeIds: new Set(types.map(row => row.id)) }
}
