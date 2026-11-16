import type { Db } from '#server/utils/batch'
import { findShopStatus } from './shops.repository'

/** The shop's status for access checks (spec §5): `undefined` when the shop has no settings row. */
export async function shopStatus(db: Db, shopId: string): Promise<'active' | 'suspended' | undefined> {
  return (await findShopStatus(db, shopId))?.status
}
