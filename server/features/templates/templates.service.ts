import type { CreateTemplateInput, Template, TemplateDefinition, TemplateList, TemplateListQuery, TemplateStatus, TemplateStatusChangeInput, TemplateSummary, UpdateTemplateInput } from '#shared/contracts/templates'
import { MAX_ACTIVE_TEMPLATES } from '#shared/contracts/templates'
import type { Currency } from '#shared/contracts/shop-settings'
import type { Db, Statement } from '#server/utils/batch'
import { isStaleWrite, isUniqueViolation, requireOneChange } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { auditStatement } from '#server/features/platform'
import type { PlatformActor } from '#server/features/identity'
import { templateChanged, templateListFull, templateNameTaken, templateNotFound, templateUnavailable, templateWrongState } from './templates.errors'
import * as repo from './templates.repository'
import type { TemplateRow } from './templates.repository'

/**
 * Slip templates (D25): a super admin's ready-made price lists, picked when creating a shop. Each
 * write is one batch with its guards and its audit row (a platform action: no `shop_id`). Only an
 * active template changes; an archived one is kept, as shops were made from it.
 */

function audit(db: Db, actor: PlatformActor, id: string, entry: { action: string, data?: Record<string, unknown> }, now: Date): Statement {
  return auditStatement(db, { userId: actor.userId, shopId: null, requestId: actor.requestId }, { ...entry, targetType: 'template', targetId: id }, now)
}

function toSummary(row: Omit<TemplateRow, 'definition'>): TemplateSummary {
  const { id, name, currency, status, version, updatedAt, serviceCount, itemCount } = row
  return { id, name, currency, status, version, serviceCount, itemCount, updatedAt: updatedAt.toISOString() }
}

function toTemplate(row: TemplateRow): Template {
  return { ...toSummary(row), definition: row.definition }
}

export async function listTemplates(db: Db, query: TemplateListQuery): Promise<TemplateList> {
  const rows = await repo.listTemplates(db, query.status ?? 'active')
  return { items: rows.map(toSummary) }
}

export async function getTemplate(db: Db, id: string): Promise<Template> {
  const row = await repo.findTemplate(db, id)
  if (!row) throw templateNotFound()
  return toTemplate(row)
}

/** Runs the batch, naming the reason when it stops: a taken name, or what `explain` finds. */
async function runTemplateBatch(db: Db, statements: [Statement, ...Statement[]], explain: () => Promise<Error>): Promise<void> {
  try {
    await db.batch(statements)
  }
  catch (error) {
    if (isUniqueViolation(error)) throw templateNameTaken()
    if (isStaleWrite(error)) throw await explain()
    throw error
  }
}

export async function createTemplate(db: Db, actor: PlatformActor, input: CreateTemplateInput, now = new Date()): Promise<Template> {
  const { name, currency, definition } = input
  const id = newId()
  await runTemplateBatch(db, [
    repo.insertTemplateStatement(db, { id, name, currency, definition, now }),
    repo.requireActiveTemplatesAtMost(db, MAX_ACTIVE_TEMPLATES),
    audit(db, actor, id, { action: 'template.create' }, now),
  ], async () => templateListFull(MAX_ACTIVE_TEMPLATES))
  return getTemplate(db, id)
}

/** Why a guarded change stopped: missing, in the wrong status, or changed since the admin read it. */
function explain(db: Db, id: string, version: number, expected: TemplateStatus) {
  return async () => {
    const current = await repo.findTemplate(db, id)
    if (!current) return templateNotFound()
    if (current.status !== expected) return templateWrongState(current.status === 'archived')
    if (current.version !== version) return templateChanged()
    return templateListFull(MAX_ACTIVE_TEMPLATES)
  }
}

/** Replaces an active template's name, currency and definition, at the version the admin read. */
export async function updateTemplate(db: Db, actor: PlatformActor, id: string, input: UpdateTemplateInput, now = new Date()): Promise<Template> {
  const { version, name, currency, definition } = input
  await runTemplateBatch(db, [
    repo.updateTemplateStatement(db, { id, version }, { set: { name, currency, definition }, from: 'active', now }),
    requireOneChange(db),
    audit(db, actor, id, { action: 'template.update' }, now),
  ], explain(db, id, version, 'active'))
  return getTemplate(db, id)
}

interface StatusChange {
  from: TemplateStatus
  to: TemplateStatus
  action: string
}

async function changeStatus(db: Db, actor: PlatformActor, id: string, input: TemplateStatusChangeInput, change: StatusChange, now: Date): Promise<Template> {
  const { version } = input
  const { from, to, action } = change
  const statements: [Statement, ...Statement[]] = [
    repo.updateTemplateStatement(db, { id, version }, { set: { status: to }, from, now }),
    requireOneChange(db),
    audit(db, actor, id, { action }, now),
  ]
  // A restore must not take the active list past its cap.
  if (to === 'active') statements.splice(2, 0, repo.requireActiveTemplatesAtMost(db, MAX_ACTIVE_TEMPLATES))
  await runTemplateBatch(db, statements, explain(db, id, version, from))
  return getTemplate(db, id)
}

/** Archived: no longer offered when creating a shop. Shops made from it keep their copy. */
export function archiveTemplate(db: Db, actor: PlatformActor, id: string, input: TemplateStatusChangeInput, now = new Date()): Promise<Template> {
  return changeStatus(db, actor, id, input, { from: 'active', to: 'archived', action: 'template.archive' }, now)
}

export function restoreTemplate(db: Db, actor: PlatformActor, id: string, input: TemplateStatusChangeInput, now = new Date()): Promise<Template> {
  return changeStatus(db, actor, id, input, { from: 'archived', to: 'active', action: 'template.restore' }, now)
}

/**
 * What a new shop copies (for `createShop`): the active template's currency and definition. The
 * caller adds `requireActiveTemplateStatement` to its batch, so a template archived after this read
 * stops the shop too. One edited after this read is copied as it was read: a copy is a snapshot.
 */
export async function templateForNewShop(db: Db, id: string): Promise<{ currency: Currency, definition: TemplateDefinition }> {
  const row = await repo.findTemplate(db, id)
  if (!row) throw templateNotFound()
  if (row.status !== 'active') throw templateUnavailable()
  return { currency: row.currency, definition: row.definition }
}

/** Stops the batch unless the template is still active (with `templateForNewShop`). */
export function requireActiveTemplateStatement(db: Db, id: string): Statement {
  return repo.requireActiveTemplate(db, id)
}
