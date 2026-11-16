import { eq } from 'drizzle-orm'
import type { Db } from '#server/utils/batch'
import { firstRow } from '#server/utils/query'
import { shopSettings } from './shops.schema'

export interface ShopStatusRow {
  status: 'active' | 'suspended'
}

/** The shop's status, or `undefined` without a settings row. */
export function findShopStatus(db: Db, shopId: string): Promise<ShopStatusRow | undefined> {
  return firstRow(db.select({ status: shopSettings.status }).from(shopSettings).where(eq(shopSettings.shopId, shopId)))
}
