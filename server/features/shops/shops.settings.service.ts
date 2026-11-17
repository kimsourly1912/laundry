import type { ShopSettings, UpdateShopSettingsInput } from '#shared/contracts/shop-settings'
import type { Db } from '#server/utils/batch'
import { requireOneChange, runBatch } from '#server/utils/batch'
import { auditStatement } from '#server/features/platform'
import { renameShopStatement } from '#server/features/identity'
import type { ShopActor } from '#server/features/identity'
import { shopChanged, shopNotFound } from './shops.errors'
import * as repo from './shops.repository'
import type { SettingsFields } from './shops.repository'

/**
 * The shop's own settings (`/api/shop/settings`, spec §3, step M2.1): the owner's view and edit.
 * The shop is the actor's; one batch per save, with its audit row in the shop's history.
 */

const FIELDS = ['name', 'phone', 'address', 'currency', 'language'] as const

export async function getSettings(db: Db, actor: ShopActor): Promise<ShopSettings> {
  const row = await repo.findSettings(db, actor.shopId)
  if (!row) throw shopNotFound()
  return row
}

/**
 * Saves every setting at the version read (409 when stale). The currency may change at any time:
 * each order keeps a copy of the shop's details, its currency included (D33).
 */
export async function updateSettings(db: Db, actor: ShopActor, input: UpdateShopSettingsInput, now = new Date()): Promise<ShopSettings> {
  const { shopId } = actor
  const { version, name, ...fields } = input
  const before = await repo.findSettings(db, shopId)
  if (!before) throw shopNotFound()
  const changed = FIELDS.filter(field => before[field] !== input[field])
  await runBatch(db, [
    repo.updateSettingsAtVersion(db, { shopId, version, now, fields: fields satisfies SettingsFields }),
    requireOneChange(db),
    renameShopStatement(db, shopId, name),
    auditStatement(db, { userId: actor.userId, shopId, requestId: actor.requestId }, { action: 'shop.settings.update', targetType: 'shop', targetId: shopId, data: { fields: changed } }, now),
  ], shopChanged)
  return getSettings(db, actor)
}
