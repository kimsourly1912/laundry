import type { Currency } from '#shared/contracts/shop-settings'
import type { Db } from '#server/utils/batch'
import { findShopCopy, findShopProfile, findShopStatus } from './shops.repository'

/** The shops feature's public API (docs/server/architecture.md → Features). */
export { createShop, getShop, listShops, resetOwnerPassword, resumeShop, revokeOwnerSessions, suspendShop, updateShop } from './shops.service'
export { getSettings, updateSettings } from './shops.settings.service'

/** The shop's status for access checks (spec §5): `undefined` when the shop has no settings row. */
export async function shopStatus(db: Db, shopId: string): Promise<'active' | 'suspended' | undefined> {
  return (await findShopStatus(db, shopId))?.status
}

/**
 * What customers see of a shop (the slip, Telegram messages, D28): its name, its currency and its
 * status. `undefined` for no such shop. No actor: the caller
 * already holds the shop's id from a trusted place (the session, an order, a link).
 */
export function shopProfile(db: Db, shopId: string): Promise<ShopProfile | undefined> {
  return findShopProfile(db, shopId)
}

export interface ShopProfile {
  name: string
  currency: Currency
  status: 'active' | 'suspended'
}

/** The shop's details as an order copies them when it's saved (D33). `undefined` for no such shop. */
export function shopCopy(db: Db, shopId: string): Promise<ShopCopy | undefined> {
  return findShopCopy(db, shopId)
}

export interface ShopCopy {
  name: string
  phone: string | null
  address: string | null
  logoImageId: string | null
  currency: Currency
}
