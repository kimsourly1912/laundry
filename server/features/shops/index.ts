import type { Currency, ShopLanguage } from '#shared/contracts/shop-settings'
import type { Db } from '#server/utils/batch'
import { findShopProfile, findShopStatus } from './shops.repository'

/** The shops feature's public API (docs/server/architecture.md → Features). */
export { createShop, getShop, listShops, platformShopActor, resetOwnerPassword, resumeShop, revokeOwnerSessions, suspendShop, updateShop } from './shops.service'
export { getSettings, updateSettings } from './shops.settings.service'

/**
 * For a read-only join (docs/server/repositories.md → Other features' tables): the reminder job
 * reads each shop's `reminderAfterDays` and `status`. Others never write it.
 */
export { shopSettings as shopSettingsTable } from './shops.schema'

/** The shop's status for access checks (spec §5): `undefined` when the shop has no settings row. */
export async function shopStatus(db: Db, shopId: string): Promise<'active' | 'suspended' | undefined> {
  return (await findShopStatus(db, shopId))?.status
}

/**
 * What customers see of a shop (receipts, Telegram messages, D28): its name, its customer-facing
 * language (D6), its currency and its status. `undefined` for no such shop. No actor: the caller
 * already holds the shop's id from a trusted place (the session, an order, a link).
 */
export function shopProfile(db: Db, shopId: string): Promise<ShopProfile | undefined> {
  return findShopProfile(db, shopId)
}

export interface ShopProfile {
  name: string
  language: ShopLanguage
  currency: Currency
  status: 'active' | 'suspended'
}
