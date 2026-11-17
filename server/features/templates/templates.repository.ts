import { and, count, desc, eq, inArray, max, ne, sql } from 'drizzle-orm'
import type { TemplateListQuery, TemplateStatus } from '#shared/contracts/templates'
import type { SlipDesign } from '#shared/contracts/slip-design'
import type { Db, Statement } from '#server/utils/batch'
import { readInChunks } from '#server/utils/batch'
import { containsText, firstRow } from '#server/utils/query'
import { templates, templateVersions } from './templates.schema'

/**
 * Templates and their versions (data-model → templates). Platform tables: no `shop_id`, and only the
 * platform's routes reach these functions. A shop reaches a template through `template_shops`
 * (`attachments.repository.ts`) or its own order.
 */

// --- Reads ---

const templateColumns = {
  id: templates.id,
  name: templates.name,
  status: templates.status,
  design: templates.design,
  version: templates.version,
  createdAt: templates.createdAt,
  updatedAt: templates.updatedAt,
}

export interface TemplateRow {
  id: string
  name: string
  status: TemplateStatus
  design: SlipDesign
  version: number
  createdAt: Date
  updatedAt: Date
}

export function findTemplate(db: Db, templateId: string): Promise<TemplateRow | undefined> {
  return firstRow(db.select(templateColumns).from(templates).where(eq(templates.id, templateId)))
}

/**
 * The platform's templates, a page at a time, most recently changed first (`templates_status_updated_idx`
 * for a status). Without a status, archived ones are left out: they're asked for by name.
 */
export async function listTemplates(db: Db, query: TemplateListQuery): Promise<{ rows: TemplateRow[], total: number }> {
  const { status, search, page, pageSize } = query
  const where = and(
    status ? eq(templates.status, status) : ne(templates.status, 'archived'),
    search ? containsText(templates.name, search) : undefined,
  )
  const [rows, [counted]] = await db.batch([
    db.select(templateColumns).from(templates).where(where).orderBy(desc(templates.updatedAt), desc(templates.id)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(templates).where(where),
  ])
  return { rows, total: counted?.total ?? 0 }
}

export interface VersionRow {
  id: string
  templateId: string
  number: number
  design: SlipDesign
}

const versionColumns = {
  id: templateVersions.id,
  templateId: templateVersions.templateId,
  number: templateVersions.number,
  design: templateVersions.design,
}

/**
 * Each template's latest version number: the highest `number` (`template_versions_template_number_unique`).
 * Templates with no version yet are missing from the map.
 */
export async function latestNumbers(db: Db, templateIds: readonly string[]): Promise<Map<string, number>> {
  const rows = await readInChunks(templateIds, ids => db.select({ templateId: templateVersions.templateId, number: max(templateVersions.number) })
    .from(templateVersions).where(inArray(templateVersions.templateId, ids)).groupBy(templateVersions.templateId))
  return new Map(rows.flatMap(row => (row.number === null ? [] : [[row.templateId, row.number] as const])))
}

/** The template's latest published version, or `undefined` before its first Publish. */
export function findLatestVersion(db: Db, templateId: string): Promise<VersionRow | undefined> {
  return firstRow(db.select(versionColumns).from(templateVersions).where(eq(templateVersions.templateId, templateId)).orderBy(desc(templateVersions.number)))
}

// --- Write statements ---

interface NewTemplate {
  id: string
  name: string
  design: SlipDesign
  userId: string
  now: Date
}

export function insertTemplateStatement(db: Db, template: NewTemplate): Statement {
  const { id, name, design, userId, now } = template
  return db.insert(templates).values({ id, name, design, status: 'draft', version: 1, createdBy: userId, createdAt: now, updatedAt: now })
}

interface TemplateChange {
  id: string
  version: number
  now: Date
  set: { name?: string, design?: SlipDesign, status?: TemplateStatus }
}

/**
 * Changes the template only while it's still at `version` and not archived, and moves it to the
 * next version. Follow it with `requireOneChange`.
 */
export function updateTemplateAtVersion(db: Db, change: TemplateChange): Statement {
  const { id, version, now, set } = change
  return db.update(templates)
    .set({ ...set, version: sql`${templates.version} + 1`, updatedAt: now })
    .where(and(eq(templates.id, id), eq(templates.version, version), ne(templates.status, 'archived')))
}

/** Brings an archived template back to `status`, only while it's still at `version` and archived. Follow it with `requireOneChange`. */
export function restoreTemplateAtVersion(db: Db, change: { id: string, version: number, now: Date, status: 'draft' | 'published' }): Statement {
  const { id, version, now, status } = change
  return db.update(templates)
    .set({ status, version: sql`${templates.version} + 1`, updatedAt: now })
    .where(and(eq(templates.id, id), eq(templates.version, version), eq(templates.status, 'archived')))
}

interface NewVersion {
  id: string
  templateId: string
  number: number
  design: SlipDesign
  userId: string
  now: Date
}

/** A published version: never changed afterwards. Its number is unique per template, so two publishes never share one. */
export function insertVersionStatement(db: Db, version: NewVersion): Statement {
  const { id, templateId, number, design, userId, now } = version
  return db.insert(templateVersions).values({ id, templateId, number, design, createdBy: userId, createdAt: now })
}
