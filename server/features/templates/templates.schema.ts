import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { TemplateDefinition } from '#shared/contracts/templates'

/**
 * Slip templates (D25, docs/server/data-model.md → slip_templates): the platform's ready-made price
 * lists. Platform-owned, so no `shop_id`: a shop never reads one, it gets a copy when it's created.
 * The definition is one JSON document, checked by `templateDefinitionSchema` on every write: it's
 * read whole and copied, never queried inside. Archived, never deleted.
 */

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`

export const TEMPLATE_STATUSES = ['active', 'archived'] as const

export const slipTemplates = sqliteTable('slip_templates', {
  id: text().primaryKey(),
  name: text().notNull(),
  currency: text({ enum: ['KHR', 'USD'] }).notNull(),
  definition: text({ mode: 'json' }).$type<TemplateDefinition>().notNull(),
  status: text({ enum: TEMPLATE_STATUSES }).notNull().default('active'),
  version: integer().notNull().default(1),
  createdAt: integer({ mode: 'timestamp_ms' }).notNull().default(nowMs),
  updatedAt: integer({ mode: 'timestamp_ms' }).notNull().default(nowMs),
}, table => [
  // Two templates never share a name, whatever the case: the admin picks one by name.
  uniqueIndex('slip_templates_name_unique').on(sql`lower(${table.name})`),
  index('slip_templates_status_name_idx').on(table.status, table.name),
  check('slip_templates_status_check', sql`${table.status} in ('active', 'archived')`),
  check('slip_templates_currency_check', sql`${table.currency} in ('KHR', 'USD')`),
  check('slip_templates_definition_check', sql`json_valid(${table.definition})`),
])
