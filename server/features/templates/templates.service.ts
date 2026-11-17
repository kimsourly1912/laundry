import type { Page } from '#shared/contracts/common'
import { toPage } from '#shared/contracts/common'
import { blankDesign } from '#shared/contracts/slip-design'
import type { SlipDesign } from '#shared/contracts/slip-design'
import type { CreateTemplateInput, PreviewTemplateInput, PublishTemplateInput, TemplateDetail, TemplateListItem, TemplateListQuery, TemplateStatusChangeInput, TemplateSummary, UpdateTemplateInput } from '#shared/contracts/templates'
import { sampleData } from '#shared/slip/fields'
import { imagesOf } from '#shared/slip/svg'
import { publishProblems } from '#shared/slip/checks'
import type { Db, Statement } from '#server/utils/batch'
import { isUniqueViolation, requireOneChange, runBatch } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { shopDate } from '#server/utils/time'
import { auditStatement } from '#server/features/platform'
import type { AuditEntry } from '#server/features/platform'
import type { PlatformActor } from '#server/features/identity'
import { findImage } from './images.repository'
import { requireImages, slipImages } from './images.service'
import { shopCounts, detachEverywhereStatement } from './attachments.repository'
import { alreadyArchived, imageNotFound, notArchived, nothingToPublish, publishChecksFailed, templateArchived, templateChanged, templateNameTaken, templateNotFound } from './templates.errors'
import { renderSlipPng } from './templates.render'
import * as repo from './templates.repository'
import type { TemplateRow } from './templates.repository'

/**
 * The platform's slip templates (plan §5, S1): start one (blank, from a photo, or a copy), save its
 * draft as the studio edits it, publish it as a fixed version, and preview it as the customer's
 * PNG. Templates are platform records: the actor is a super admin, and ids come from the path.
 *
 * Audit: creating, renaming and publishing a template write an audit row. The draft's autosave
 * (about once a second while editing) doesn't: a draft reaches no shop until it's published.
 */

function audit(db: Db, actor: PlatformActor, templateId: string, entry: Omit<AuditEntry, 'targetType' | 'targetId'>, now: Date): Statement {
  return auditStatement(db, { userId: actor.userId, shopId: null, requestId: actor.requestId }, { ...entry, targetType: 'template', targetId: templateId }, now)
}

function toSummary(row: TemplateRow, counts: { latestVersion: number | null, shopCount: number }): TemplateSummary {
  const { id, name, status, design, version, createdAt, updatedAt } = row
  return { id, name, status, width: design.width, height: design.height, ...counts, version, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() }
}

/** Valibot's output keeps the schema's key order, so equal designs are equal JSON. */
function sameDesign(a: SlipDesign, b: SlipDesign): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

async function loadTemplate(db: Db, templateId: string): Promise<TemplateRow> {
  const row = await repo.findTemplate(db, templateId)
  if (!row) throw templateNotFound()
  return row
}

/** The platform's list, each with its draft for the thumbnail and how many shops use it. */
export async function listTemplates(db: Db, query: TemplateListQuery): Promise<Page<TemplateListItem>> {
  const { rows, total } = await repo.listTemplates(db, query)
  const ids = rows.map(row => row.id)
  const [latest, shops] = await Promise.all([repo.latestNumbers(db, ids), shopCounts(db, ids)])
  return toPage(rows.map(row => ({ ...toSummary(row, { latestVersion: latest.get(row.id) ?? null, shopCount: shops.get(row.id) ?? 0 }), design: row.design })), query, total)
}

export async function getTemplate(db: Db, templateId: string): Promise<TemplateDetail> {
  const [row, latest, shops] = await Promise.all([loadTemplate(db, templateId), repo.findLatestVersion(db, templateId), shopCounts(db, [templateId])])
  const summary = toSummary(row, { latestVersion: latest?.number ?? null, shopCount: shops.get(templateId) ?? 0 })
  return { ...summary, design: row.design, hasUnpublishedChanges: !latest || !sameDesign(latest.design, row.design) }
}

/**
 * Archives the template (plan §4: never deleted): hidden from the list, no longer attachable, and
 * detached from every shop in the same batch, so no new order uses it. Its versions and orders stay.
 */
export async function archiveTemplate(db: Db, actor: PlatformActor, templateId: string, input: TemplateStatusChangeInput, now = new Date()): Promise<TemplateDetail> {
  const row = await loadTemplate(db, templateId)
  if (row.status === 'archived') throw alreadyArchived()
  await runBatch(db, [
    repo.updateTemplateAtVersion(db, { id: templateId, version: input.version, now, set: { status: 'archived' } }),
    requireOneChange(db),
    detachEverywhereStatement(db, templateId),
    audit(db, actor, templateId, { action: 'template.archive' }, now),
  ], templateChanged)
  return getTemplate(db, templateId)
}

/** Brings an archived template back: published if it has a version, else a draft. Shops are attached again by hand. */
export async function restoreTemplate(db: Db, actor: PlatformActor, templateId: string, input: TemplateStatusChangeInput, now = new Date()): Promise<TemplateDetail> {
  const [row, latest] = await Promise.all([loadTemplate(db, templateId), repo.findLatestVersion(db, templateId)])
  if (row.status !== 'archived') throw notArchived()
  await runBatch(db, [
    repo.restoreTemplateAtVersion(db, { id: templateId, version: input.version, now, status: latest ? 'published' : 'draft' }),
    requireOneChange(db),
    audit(db, actor, templateId, { action: 'template.restore' }, now),
  ], templateChanged)
  return getTemplate(db, templateId)
}

/** Where each image the design draws is named, for `requireImages`'s error. */
function imageReferences(design: SlipDesign, path: string): Map<string, string> {
  const references = new Map<string, string>()
  if (design.background.imageId) references.set(design.background.imageId, `${path}.background.imageId`)
  design.elements.forEach((element, index) => {
    if (element.type === 'image' && !references.has(element.imageId)) references.set(element.imageId, `${path}.elements.${index}.imageId`)
  })
  return references
}

/** The first draft of a new template (plan §5.2). */
async function startingDesign(db: Db, start: CreateTemplateInput['start']): Promise<SlipDesign> {
  if (start.kind === 'blank') return blankDesign(start.width, start.height)
  if (start.kind === 'photo') {
    // The canvas takes the photo's size; the photo is the background.
    const image = await findImage(db, start.imageId)
    if (!image) throw imageNotFound()
    return { ...blankDesign(image.width, image.height), background: { color: '#ffffff', imageId: image.id } }
  }
  return (await loadTemplate(db, start.templateId)).design
}

/** A new draft template. 409 `TEMPLATE_NAME_TAKEN` when another has the name (whatever the case). */
export async function createTemplate(db: Db, actor: PlatformActor, input: CreateTemplateInput, now = new Date()): Promise<TemplateDetail> {
  const { name, start } = input
  const design = await startingDesign(db, start)
  const id = newId()
  try {
    await db.batch([
      repo.insertTemplateStatement(db, { id, name, design, userId: actor.userId, now }),
      audit(db, actor, id, { action: 'template.create', data: { start: start.kind, ...(start.kind === 'copy' ? { from: start.templateId } : {}) } }, now),
    ])
  }
  catch (error) {
    if (isUniqueViolation(error)) throw templateNameTaken()
    throw error
  }
  return getTemplate(db, id)
}

/**
 * The studio's autosave (plan §5.8): the name, the draft, or both, at the version read. Stale → 409
 * `VERSION_CONFLICT`; an archived template can't change (409 `INVALID_STATE`). Every image the draft
 * draws must exist.
 */
export async function updateTemplate(db: Db, actor: PlatformActor, templateId: string, input: UpdateTemplateInput, now = new Date()): Promise<TemplateDetail> {
  const { version, name, design } = input
  const before = await loadTemplate(db, templateId)
  if (before.status === 'archived') throw templateArchived()
  if (design) await requireImages(db, imageReferences(design, 'design'))
  const renamed = name !== undefined && name !== before.name
  try {
    await runBatch(db, [
      repo.updateTemplateAtVersion(db, { id: templateId, version, now, set: { name, design } }),
      requireOneChange(db),
      ...(renamed ? [audit(db, actor, templateId, { action: 'template.rename' }, now)] : []),
    ], templateChanged)
  }
  catch (error) {
    if (isUniqueViolation(error)) throw templateNameTaken()
    throw error
  }
  return getTemplate(db, templateId)
}

/**
 * Fixes the draft at `version` as the template's next version (plan §5.8): new orders use it at
 * once, existing orders keep theirs. The version guard makes two publishes at once safe: one moves
 * the template's version, so the other's batch stops, and its version number is never used.
 */
export async function publishTemplate(db: Db, actor: PlatformActor, templateId: string, input: PublishTemplateInput, now = new Date()): Promise<TemplateDetail> {
  const { version } = input
  const [row, latest] = await Promise.all([loadTemplate(db, templateId), repo.findLatestVersion(db, templateId)])
  if (row.status === 'archived') throw templateArchived()
  if (row.version !== version) throw templateChanged()
  if (latest && sameDesign(latest.design, row.design)) throw nothingToPublish(latest.number)
  const { errors } = publishProblems(row.design)
  if (errors.length) throw publishChecksFailed(errors)
  await requireImages(db, imageReferences(row.design, 'design'))
  const number = (latest?.number ?? 0) + 1
  await runBatch(db, [
    repo.updateTemplateAtVersion(db, { id: templateId, version, now, set: { status: 'published' } }),
    requireOneChange(db),
    repo.insertVersionStatement(db, { id: newId(), templateId, number, design: row.design, userId: actor.userId, now }),
    audit(db, actor, templateId, { action: 'template.publish', data: { number } }, now),
  ], templateChanged)
  return getTemplate(db, templateId)
}

/**
 * The design on screen (saved or not) as the customer's PNG, with sample values and the sample
 * shop (plan §5.1 → Preview). Draws exactly what an order's slip will, through the same builder.
 */
export async function previewTemplate(db: Db, templateId: string, input: PreviewTemplateInput, now = new Date()): Promise<Uint8Array<ArrayBuffer>> {
  const { design } = input
  await loadTemplate(db, templateId)
  await requireImages(db, imageReferences(design, 'design'))
  const data = sampleData(design, { date: shopDate(now) })
  return renderSlipPng({ design, data, images: await slipImages(db, imagesOf(design, data.shop)) })
}
