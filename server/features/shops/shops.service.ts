import type { Page } from '#shared/contracts/common'
import { toPage } from '#shared/contracts/common'
import type { CreateShopInput, PlatformShop, PlatformShopDetail, ResetOwnerPasswordInput, ShopListQuery, ShopStatus, ShopStatusChangeInput, UpdateShopInput } from '#shared/contracts/platform-shops'
import type { Db, Statement } from '#server/utils/batch'
import { isUniqueViolation, requireOneChange, runBatch } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { auditStatement } from '#server/features/platform'
import type { AuditEntry } from '#server/features/platform'
import { newShopStatements, ownerPasswordResetStatements, renameShopStatement, requireShopNamesAvailable, revokeSessionsStatements, shopOwner, shopOwners } from '#server/features/identity'
import type { PlatformActor } from '#server/features/identity'
import { alreadySuspended, notSuspended, ownerNotFound, shopChanged, shopNotFound } from './shops.errors'
import * as repo from './shops.repository'
import type { ShopRow } from './shops.repository'

/**
 * The platform's shops (spec §9 → Platform, step M1.5). A super admin creates a shop with its
 * owner, renames, suspends and resumes it, and resets or signs out its owner. Every change is one
 * batch with its audit row: a platform action (no `shop_id`), the shop as its target. Shop ids come
 * from the path here: the platform acts on any shop, and a missing one is 404.
 */

/** The audit row of a platform action on a shop. */
function audit(db: Db, actor: PlatformActor, shopId: string, entry: Omit<AuditEntry, 'targetType' | 'targetId'>, now: Date): Statement {
  return auditStatement(db, { userId: actor.userId, shopId: null, requestId: actor.requestId }, { ...entry, targetType: 'shop', targetId: shopId }, now)
}

async function toPlatformShops(db: Db, rows: ShopRow[]): Promise<PlatformShop[]> {
  const owners = await shopOwners(db, rows.map(row => row.id))
  return rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString(), owner: owners.get(row.id) ?? null }))
}

export async function listShops(db: Db, query: ShopListQuery): Promise<Page<PlatformShop>> {
  const { rows, total } = await repo.listShops(db, query)
  return toPage(await toPlatformShops(db, rows), query, total)
}

async function loadShop(db: Db, shopId: string): Promise<ShopRow> {
  const row = await repo.findShop(db, shopId)
  if (!row) throw shopNotFound()
  return row
}

export async function getShop(db: Db, shopId: string): Promise<PlatformShopDetail> {
  const [shop] = await toPlatformShops(db, [await loadShop(db, shopId)])
  return shop!
}

/**
 * A new shop and its owner in one batch: the organization, settings, owner account and membership,
 * and the audit row. All of it or nothing. 409 `USERNAME_TAKEN` / `SLUG_TAKEN` name the field.
 * Templates are attached afterwards (plan step 2).
 */
export async function createShop(db: Db, actor: PlatformActor, input: CreateShopInput, now = new Date()): Promise<PlatformShopDetail> {
  const { name, slug, owner } = input
  const shopId = newId()
  const statements = await newShopStatements(db, { shopId, name, slug, owner, now })
  try {
    await db.batch([
      audit(db, actor, shopId, { action: 'shop.create', data: { ownerUsername: owner.username } }, now),
      ...statements,
      repo.insertSettingsStatement(db, { shopId, now }),
    ])
  }
  catch (error) {
    // Another save took the username or short name since the check: say which.
    if (isUniqueViolation(error)) await requireShopNamesAvailable(db, { username: owner.username, slug })
    throw error
  }
  return getShop(db, shopId)
}

/** Renames the shop, at the version the admin saw (409 when stale: the batch's guard decides). */
export async function updateShop(db: Db, actor: PlatformActor, shopId: string, input: UpdateShopInput, now = new Date()): Promise<PlatformShopDetail> {
  const { version, name } = input
  await loadShop(db, shopId)
  await runBatch(db, [
    repo.updateSettingsAtVersion(db, { shopId, version, now }),
    requireOneChange(db),
    renameShopStatement(db, shopId, name),
    audit(db, actor, shopId, { action: 'shop.update', data: { fields: ['name'] } }, now),
  ], shopChanged)
  return getShop(db, shopId)
}

interface StatusChange {
  from: ShopStatus
  to: ShopStatus
  action: string
  wrongState: () => Error
}

async function changeStatus(db: Db, actor: PlatformActor, shopId: string, input: ShopStatusChangeInput, change: StatusChange, now: Date): Promise<PlatformShopDetail> {
  const { version } = input
  const { from, to, action, wrongState } = change
  const shop = await loadShop(db, shopId)
  if (shop.status !== from) throw wrongState()
  await runBatch(db, [
    repo.updateSettingsAtVersion(db, { shopId, version, now, status: to }),
    requireOneChange(db),
    audit(db, actor, shopId, { action }, now),
  ], shopChanged)
  return getShop(db, shopId)
}

/**
 * Suspends the shop (spec §5): its owner can still sign in and sees the notice, every shop API
 * answers 403 `SHOP_SUSPENDED`, its ticket pages say "unavailable". Nothing is deleted.
 */
export function suspendShop(db: Db, actor: PlatformActor, shopId: string, input: ShopStatusChangeInput, now = new Date()): Promise<PlatformShopDetail> {
  return changeStatus(db, actor, shopId, input, { from: 'active', to: 'suspended', action: 'shop.suspend', wrongState: alreadySuspended }, now)
}

export function resumeShop(db: Db, actor: PlatformActor, shopId: string, input: ShopStatusChangeInput, now = new Date()): Promise<PlatformShopDetail> {
  return changeStatus(db, actor, shopId, input, { from: 'suspended', to: 'active', action: 'shop.resume', wrongState: notSuspended }, now)
}

async function loadOwner(db: Db, shopId: string) {
  await loadShop(db, shopId)
  const owner = await shopOwner(db, shopId)
  if (!owner) throw ownerNotFound()
  return owner
}

/**
 * The owner forgot their password (spec §16): a new temporary password, changed at the next
 * sign-in, and every owner session ended.
 */
export async function resetOwnerPassword(db: Db, actor: PlatformActor, shopId: string, input: ResetOwnerPasswordInput, now = new Date()): Promise<void> {
  const owner = await loadOwner(db, shopId)
  await db.batch([
    audit(db, actor, shopId, { action: 'owner.reset-password', data: { ownerId: owner.id } }, now),
    ...await ownerPasswordResetStatements(db, { userId: owner.id, password: input.password, now }),
  ])
}

/** The owner's phone was lost (spec §16): every owner session ends; the password stays. */
export async function revokeOwnerSessions(db: Db, actor: PlatformActor, shopId: string, now = new Date()): Promise<void> {
  const owner = await loadOwner(db, shopId)
  await db.batch([
    audit(db, actor, shopId, { action: 'owner.revoke-sessions', data: { ownerId: owner.id } }, now),
    ...revokeSessionsStatements(db, owner.id),
  ])
}
