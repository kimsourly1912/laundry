import type { ShopSettings, UpdateShopSettingsInput } from '#shared/contracts/shop-settings'
import type { Db } from '#server/utils/batch'
import { isStaleWrite, requireOneChange } from '#server/utils/batch'
import { auditStatement } from '#server/features/platform'
import { renameShopStatement } from '#server/features/identity'
import type { ShopActor } from '#server/features/identity'
import { hasPriceItems, requireEmptyPriceListStatement } from '#server/features/pricing'
import { currencyLocked, shopChanged, shopNotFound } from './shops.errors'
import * as repo from './shops.repository'
import type { SettingsFields } from './shops.repository'

/**
 * The shop's own settings (`/api/shop/settings`, spec §3, step M2.1): the owner's view and edit.
 * The shop is the actor's; one batch per save, with its audit row in the shop's history.
 */

const FIELDS = ['name', 'phone', 'address', 'currency', 'policyTextKm', 'policyTextEn', 'reminderAfterDays', 'language'] as const

export async function getSettings(db: Db, actor: ShopActor): Promise<ShopSettings> {
  const [row, locked] = await Promise.all([repo.findSettings(db, actor.shopId), hasPriceItems(db, actor.shopId)])
  if (!row) throw shopNotFound()
  return { ...row, currencyLocked: locked }
}

/**
 * Saves every setting at the version read (409 when stale). The currency changes only while the
 * price list is empty, checked inside the batch (D22): prices are amounts in that currency.
 */
export async function updateSettings(db: Db, actor: ShopActor, input: UpdateShopSettingsInput, now = new Date()): Promise<ShopSettings> {
  const { shopId } = actor
  const { version, name, ...fields } = input
  const before = await repo.findSettings(db, shopId)
  if (!before) throw shopNotFound()
  const changed = FIELDS.filter(field => before[field] !== input[field])
  const currencyChanges = before.currency !== fields.currency
  try {
    await db.batch([
      repo.updateSettingsAtVersion(db, { shopId, version, now, fields: fields satisfies SettingsFields }),
      requireOneChange(db),
      ...(currencyChanges ? [requireEmptyPriceListStatement(db, shopId)] : []),
      renameShopStatement(db, shopId, name),
      auditStatement(db, { userId: actor.userId, shopId, requestId: actor.requestId }, { action: 'shop.settings.update', targetType: 'shop', targetId: shopId, data: { fields: changed } }, now),
    ])
  }
  catch (error) {
    if (!isStaleWrite(error)) throw error
    // The version moved, or prices appeared since the form was opened.
    const current = await repo.findSettings(db, shopId)
    throw current && current.version === version && currencyChanges ? currencyLocked() : shopChanged()
  }
  return getSettings(db, actor)
}
