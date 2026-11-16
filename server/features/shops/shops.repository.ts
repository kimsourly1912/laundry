import { and, count, desc, eq, or, sql } from 'drizzle-orm'
import type { ShopListQuery, ShopStatus } from '#shared/contracts/platform-shops'
import type { Currency, ShopLanguage } from '#shared/contracts/shop-settings'
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
  currency: shopSettings.currency,
  version: shopSettings.version,
  createdAt: organization.createdAt,
}

export interface ShopRow {
  id: string
  name: string
  slug: string
  status: ShopStatus
  currency: Currency
  version: number
  createdAt: Date
}

export function findShop(db: Db, shopId: string): Promise<ShopRow | undefined> {
  return firstRow(db.select(shopColumns).from(shopSettings).innerJoin(organization, eq(organization.id, shopSettings.shopId)).where(eq(shopSettings.shopId, shopId)))
}

/** What customers see of a shop (receipts, Telegram messages): its name, language and currency, and its status. */
export function findShopProfile(db: Db, shopId: string) {
  return firstRow(db.select({ name: organization.name, language: shopSettings.language, currency: shopSettings.currency, status: shopSettings.status })
    .from(shopSettings).innerJoin(organization, eq(organization.id, shopSettings.shopId)).where(eq(shopSettings.shopId, shopId)))
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
  /** The template's (D25); the default (riel) without one. */
  currency?: Currency
  now: Date
}

/** A new shop's settings: active, version 1, the defaults of spec §6. */
export function insertSettingsStatement(db: Db, settings: NewSettings): Statement {
  const { shopId, currency, now } = settings
  return db.insert(shopSettings).values({ shopId, status: 'active', currency, version: 1, createdAt: now, updatedAt: now })
}

/** The settings an owner edits (spec §3 → Shop settings); the name is the organization's. */
export interface SettingsFields {
  phone: string | null
  address: string | null
  currency: Currency
  policyTextKm: string | null
  policyTextEn: string | null
  reminderAfterDays: number
  language: ShopLanguage
}

interface SettingsChange {
  shopId: string
  version: number
  now: Date
  status?: ShopStatus
  fields?: SettingsFields
}

/**
 * Moves the shop to the next version (and status, or settings) only while it's still at `version`:
 * every change moves the version, so the status the service checked holds too. Follow it with
 * `requireOneChange`.
 */
export function updateSettingsAtVersion(db: Db, change: SettingsChange): Statement {
  const { shopId, version, now, status, fields } = change
  return db.update(shopSettings)
    .set({ ...fields, ...(status ? { status } : {}), version: sql`${shopSettings.version} + 1`, updatedAt: now })
    .where(and(eq(shopSettings.shopId, shopId), eq(shopSettings.version, version)))
}

const settingsColumns = {
  name: organization.name,
  phone: shopSettings.phone,
  address: shopSettings.address,
  currency: shopSettings.currency,
  policyTextKm: shopSettings.policyTextKm,
  policyTextEn: shopSettings.policyTextEn,
  reminderAfterDays: shopSettings.reminderAfterDays,
  language: shopSettings.language,
  version: shopSettings.version,
}

export type SettingsRow = SettingsFields & { name: string, version: number }

/** The shop's settings, with its name. */
export function findSettings(db: Db, shopId: string): Promise<SettingsRow | undefined> {
  return firstRow(db.select(settingsColumns).from(shopSettings).innerJoin(organization, eq(organization.id, shopSettings.shopId)).where(eq(shopSettings.shopId, shopId)))
}
