import { and, asc, eq, sql } from 'drizzle-orm'
import type { TemplateDefinition, TemplateStatus } from '#shared/contracts/templates'
import type { Currency } from '#shared/contracts/shop-settings'
import type { Db, Statement } from '#server/utils/batch'
import { requireAtMost, requireCount } from '#server/utils/batch'
import { firstRow } from '#server/utils/query'
import { slipTemplates } from './templates.schema'

// --- Reads ---

const summaryColumns = {
  id: slipTemplates.id,
  name: slipTemplates.name,
  currency: slipTemplates.currency,
  status: slipTemplates.status,
  version: slipTemplates.version,
  updatedAt: slipTemplates.updatedAt,
  serviceCount: sql<number>`json_array_length(${slipTemplates.definition}, '$.services')`,
  itemCount: sql<number>`json_array_length(${slipTemplates.definition}, '$.items')`,
}

/** The templates with `status`, by name. At most `MAX_ACTIVE_TEMPLATES` active ones. */
export function listTemplates(db: Db, status: TemplateStatus) {
  return db.select(summaryColumns).from(slipTemplates).where(eq(slipTemplates.status, status)).orderBy(asc(slipTemplates.name), asc(slipTemplates.id))
}

export function findTemplate(db: Db, id: string) {
  return firstRow(db.select({ ...summaryColumns, definition: slipTemplates.definition }).from(slipTemplates).where(eq(slipTemplates.id, id)))
}

export type TemplateRow = NonNullable<Awaited<ReturnType<typeof findTemplate>>>

// --- Guards ---

/** At most `max` active templates once the batch's earlier statements ran. */
export function requireActiveTemplatesAtMost(db: Db, max: number): Statement {
  return requireAtMost(db, sql`${db.$count(slipTemplates, eq(slipTemplates.status, 'active'))}`, max)
}

/** The template exists and is active (a shop is being made from it). */
export function requireActiveTemplate(db: Db, id: string): Statement {
  return requireCount(db, sql`${db.$count(slipTemplates, and(eq(slipTemplates.id, id), eq(slipTemplates.status, 'active')))}`, 1)
}

// --- Write statements ---

interface TemplateFields {
  name: string
  currency: Currency
  definition: TemplateDefinition
}

export function insertTemplateStatement(db: Db, row: TemplateFields & { id: string, now: Date }): Statement {
  const { id, name, currency, definition, now } = row
  return db.insert(slipTemplates).values({ id, name, currency, definition, createdAt: now, updatedAt: now })
}

interface VersionKey {
  id: string
  version: number
}

type TemplateSet = Partial<TemplateFields> & { status?: TemplateStatus }

/**
 * Changes the template at `version` (and, with `from`, only in that status). Follow with
 * `requireOneChange`: a stale version or a wrong status changes nothing and stops the batch.
 */
export function updateTemplateStatement(db: Db, key: VersionKey, update: { set: TemplateSet, from?: TemplateStatus, now: Date }): Statement {
  const { set, from, now } = update
  return db.update(slipTemplates)
    .set({ ...set, updatedAt: now, version: sql`${slipTemplates.version} + 1` })
    .where(and(eq(slipTemplates.id, key.id), eq(slipTemplates.version, key.version), from ? eq(slipTemplates.status, from) : undefined))
}
