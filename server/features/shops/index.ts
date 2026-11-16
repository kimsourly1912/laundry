import type { Db } from '#server/utils/batch'
import { findShopStatus } from './shops.repository'

/** The shops feature's public API (docs/server/architecture.md → Features). */
export { createShop, getShop, listShops, resetOwnerPassword, resumeShop, revokeOwnerSessions, suspendShop, updateShop } from './shops.service'
export { getSettings, updateSettings } from './shops.settings.service'

/** The shop's status for access checks (spec §5): `undefined` when the shop has no settings row. */
export async function shopStatus(db: Db, shopId: string): Promise<'active' | 'suspended' | undefined> {
  return (await findShopStatus(db, shopId))?.status
}
