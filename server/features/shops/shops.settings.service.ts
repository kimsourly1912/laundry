import type { ShopSettings } from '#shared/contracts/shop-settings'
import type { Db } from '#server/utils/batch'
import type { ShopActor } from '#server/features/identity'
import { shopNotFound } from './shops.errors'
import * as repo from './shops.repository'

/**
 * The shop's details as its owner's app reads them (`GET /api/shop/settings`): what its slips print.
 * Only the platform changes them (D44, `updateShop`). The shop is the actor's.
 */
export async function getSettings(db: Db, actor: ShopActor): Promise<ShopSettings> {
  const row = await repo.findSettings(db, actor.shopId)
  if (!row) throw shopNotFound()
  return row
}
