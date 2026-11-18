import { and, asc, count, eq, inArray } from 'drizzle-orm'
import type { TemplateStatus } from '#shared/contracts/templates'
import type { Db, Statement } from '#server/utils/batch'
import { readInChunks, requireCount } from '#server/utils/batch'
import { organization } from '#server/db/tables'
import { templateShops, templates } from './templates.schema'

/**
 * Which templates a shop may use (data-model → template_shops): a shop-owned table. Functions about
 * one shop take `shopId` and filter by it; the ones about a template's shops work across shops on
 * purpose and say so (the platform console).
 */

// --- Reads ---

export interface ShopTemplateRow {
  templateId: string
  name: string
  status: TemplateStatus
  isDefault: boolean
  attachedAt: Date
}

/** The shop's attached templates, by name. */
export function templatesOfShop(db: Db, shopId: string): Promise<ShopTemplateRow[]> {
  return db.select({ templateId: templateShops.templateId, name: templates.name, status: templates.status, isDefault: templateShops.isDefault, attachedAt: templateShops.attachedAt })
    .from(templateShops)
    .innerJoin(templates, eq(templates.id, templateShops.templateId))
    .where(eq(templateShops.shopId, shopId))
    .orderBy(asc(templates.name), asc(templates.id))
}

export interface TemplateShopRow {
  shopId: string
  name: string
  isDefault: boolean
  attachedAt: Date
}

/** Across shops (the platform console): the shops a template is attached to, by name (`template_shops_template_idx`). */
export function shopsOfTemplate(db: Db, templateId: string): Promise<TemplateShopRow[]> {
  return db.select({ shopId: templateShops.shopId, name: organization.name, isDefault: templateShops.isDefault, attachedAt: templateShops.attachedAt })
    .from(templateShops)
    .innerJoin(organization, eq(organization.id, templateShops.shopId))
    .where(eq(templateShops.templateId, templateId))
    .orderBy(asc(organization.name), asc(templateShops.shopId))
}

/** Across shops (the platform's list): how many shops each template is attached to. */
export async function shopCounts(db: Db, templateIds: readonly string[]): Promise<Map<string, number>> {
  const rows = await readInChunks(templateIds, ids => db.select({ templateId: templateShops.templateId, shops: count() })
    .from(templateShops).where(inArray(templateShops.templateId, ids)).groupBy(templateShops.templateId))
  return new Map(rows.map(row => [row.templateId, row.shops]))
}

/** Whether the template is attached to the shop. */
export async function isAttached(db: Db, shopId: string, templateId: string): Promise<boolean> {
  return (await db.$count(templateShops, and(eq(templateShops.shopId, shopId), eq(templateShops.templateId, templateId)))) > 0
}

/** The shop's attached templates that are published: what a new order may be filled on (plan §4). */
export function orderableTemplatesOfShop(db: Db, shopId: string): Promise<{ templateId: string, name: string, isDefault: boolean }[]> {
  return db.select({ templateId: templateShops.templateId, name: templates.name, isDefault: templateShops.isDefault })
    .from(templateShops)
    .innerJoin(templates, eq(templates.id, templateShops.templateId))
    .where(and(eq(templateShops.shopId, shopId), eq(templates.status, 'published')))
    .orderBy(asc(templates.name), asc(templates.id))
}

// --- Guards ---

/** Aborts the batch unless the template is still attached to the shop (the platform may detach it meanwhile). */
export function requireAttached(db: Db, shopId: string, templateId: string): Statement {
  return requireCount(db, db.$count(templateShops, and(eq(templateShops.shopId, shopId), eq(templateShops.templateId, templateId))), 1)
}

/**
 * Aborts the batch unless the template is still published (a published template has a version; an
 * archived or draft one may not be attached): an archive landing between the check and the attach
 * stops it.
 */
export function requireAttachable(db: Db, templateId: string): Statement {
  return requireCount(db, db.$count(templates, and(eq(templates.id, templateId), eq(templates.status, 'published'))), 1)
}

// --- Write statements ---

/** Attaches the template to the shop; already attached: nothing changes. */
export function attachStatement(db: Db, shopId: string, templateId: string, now: Date): Statement {
  return db.insert(templateShops).values({ shopId, templateId, isDefault: false, attachedAt: now }).onConflictDoNothing()
}

/** Detaches the template from the shop; its default goes with it (plan §4). */
export function detachStatement(db: Db, shopId: string, templateId: string): Statement {
  return db.delete(templateShops).where(and(eq(templateShops.shopId, shopId), eq(templateShops.templateId, templateId)))
}

/** Across shops: detaches the template from every shop (it's being archived). */
export function detachEverywhereStatement(db: Db, templateId: string): Statement {
  return db.delete(templateShops).where(eq(templateShops.templateId, templateId))
}

/** Whether the shop exists (an organization: a shop). */
export async function shopExists(db: Db, shopId: string): Promise<boolean> {
  return (await db.$count(organization, eq(organization.id, shopId))) > 0
}
