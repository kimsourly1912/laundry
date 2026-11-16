import { and, count, desc, eq, or, sql } from 'drizzle-orm'
import type { ShopListQuery, ShopStatus } from '#shared/contracts/platform-shops'
import type { Db, Statement } from '#server/utils/batch'
import { containsText, firstRow } from '#server/utils/query'
import { organization } from '#server/db/tables'
import { shopSettings } from './shops.schema'

// --- Reads ---

export interface ShopStatusRow {
  status: ShopStatus
}

/** The shop's status, or `undefined` without a settings row. */
export function findShopStatus(db: Db, shopId: string): Promise<ShopStatusRow | undefined> {
  return firstRow(db.select({ status: shopSettings.status }).from(shopSettings).where(eq(shopSettings.shopId, shopId)))
}

/** A shop as the platform sees it: the organization's name and short name, and its settings' status. */
const shopColumns = {
  id: shopSettings.shopId,
  name: organization.name,
  slug: organization.slug,
  status: shopSettings.status,
  version: shopSettings.version,
  createdAt: organization.createdAt,
}

export interface ShopRow {
  id: string
  name: string
  slug: string
  status: ShopStatus
  version: number
  createdAt: Date
}

export function findShop(db: Db, shopId: string): Promise<ShopRow | undefined> {
  return firstRow(db.select(shopColumns).from(shopSettings).innerJoin(organization, eq(organization.id, shopSettings.shopId)).where(eq(shopSettings.shopId, shopId)))
}

/** Across shops (the platform's list): newest first, a page at a time, with how many match. */
export async function listShops(db: Db, query: ShopListQuery): Promise<{ rows: ShopRow[], total: number }> {
  const { status, search, page, pageSize } = query
  const where = and(
    status ? eq(shopSettings.status, status) : undefined,
    search ? or(containsText(organization.name, search), containsText(organization.slug, search)) : undefined,
  )
  const [rows, [counted]] = await db.batch([
    db.select(shopColumns).from(shopSettings).innerJoin(organization, eq(organization.id, shopSettings.shopId)).where(where)
      .orderBy(desc(organization.createdAt), desc(shopSettings.shopId)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(shopSettings).innerJoin(organization, eq(organization.id, shopSettings.shopId)).where(where),
  ])
  return { rows, total: counted?.total ?? 0 }
}

// --- Write statements ---

interface NewSettings {
  shopId: string
  now: Date
}

/** A new shop's settings: active, version 1, the defaults of spec §6. */
export function insertSettingsStatement(db: Db, settings: NewSettings): Statement {
  const { shopId, now } = settings
  return db.insert(shopSettings).values({ shopId, status: 'active', version: 1, createdAt: now, updatedAt: now })
}

interface SettingsChange {
  shopId: string
  version: number
  now: Date
  status?: ShopStatus
}

/**
 * Moves the shop to the next version (and status) only while it's still at `version`: every change
 * moves the version, so the status the service checked holds too. Follow it with `requireOneChange`.
 */
export function updateSettingsAtVersion(db: Db, change: SettingsChange): Statement {
  const { shopId, version, now, status } = change
  return db.update(shopSettings)
    .set({ ...(status ? { status } : {}), version: sql`${shopSettings.version} + 1`, updatedAt: now })
    .where(and(eq(shopSettings.shopId, shopId), eq(shopSettings.version, version)))
}
