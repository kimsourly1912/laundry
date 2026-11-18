import type { OrderTemplate } from '#shared/contracts/orders'
import type { ImageType } from '#shared/contracts/templates'
import type { SlipDesign } from '#shared/contracts/slip-design'
import { imagesOf } from '#shared/slip/svg'
import type { Db, Statement } from '#server/utils/batch'
import { requireOneChange, runBatch } from '#server/utils/batch'
import { auditStatement } from '#server/features/platform'
import type { ShopActor } from '#server/features/identity'
import * as attachments from './attachments.repository'
import { fromBase64 } from './images.bytes'
import { imagesData } from './images.repository'
import * as repo from './templates.repository'
import type { VersionWithTemplateRow } from './templates.repository'
import { imageNotFound, paperSlipNotFound } from './templates.errors'

/**
 * Templates as a shop sees them (plan §4, step 3): only the published templates attached to it, at
 * their latest version, which a new order is filled on. A template the shop can't use answers 404,
 * like a missing one. The shop always comes from the caller's actor, never from the request.
 */

/** The templates the shop's owner can fill a new order on, by name, each at its latest version. */
export async function orderTemplates(db: Db, actor: ShopActor): Promise<OrderTemplate[]> {
  const rows = await attachments.orderableTemplatesOfShop(db, actor.shopId)
  const latest = await Promise.all(rows.map(row => repo.findLatestVersion(db, row.templateId)))
  return rows.flatMap((row, i) => {
    const version = latest[i]
    // A published template always has a version; skip one that somehow has none.
    if (!version) return []
    return [{ templateId: row.templateId, name: row.name, isDefault: row.isDefault, versionId: version.id, versionNumber: version.number, design: version.design }]
  })
}

export interface OrderableVersion {
  versionId: string
  templateId: string
  number: number
  templateName: string
  design: SlipDesign
}

/**
 * The version a new order is filled on, checked for the shop: its template is attached to the shop
 * and published (404 otherwise). Whether it is still the template's latest version is checked by
 * `orderableVersionGuards` inside the order's batch (409 `TEMPLATE_CHANGED`), the one place that
 * can't race with a Publish.
 */
export async function orderableVersion(db: Db, shopId: string, versionId: string): Promise<OrderableVersion> {
  const [version] = await repo.findVersions(db, [versionId])
  if (!version) throw paperSlipNotFound()
  const usable = await attachments.orderableTemplatesOfShop(db, shopId)
  if (!usable.some(row => row.templateId === version.templateId)) throw paperSlipNotFound()
  return { versionId: version.id, templateId: version.templateId, number: version.number, templateName: version.templateName, design: version.design }
}

/**
 * Guards for the order's own batch: the template is still attached to the shop, and no version was
 * published after the one the order uses. Either changing between the check and the write stops
 * the batch (the caller turns it into `templateChangedForOrder`).
 */
export function orderableVersionGuards(db: Db, shopId: string, version: Pick<OrderableVersion, 'templateId' | 'number'>): Statement[] {
  return [
    attachments.requireAttached(db, shopId, version.templateId),
    repo.requireNoVersionAfter(db, version.templateId, version.number),
  ]
}

/** Versions by id, with their template's name: what an order's slip is drawn on. */
export async function versionsById(db: Db, versionIds: readonly string[]): Promise<Map<string, VersionWithTemplateRow>> {
  const rows = await repo.findVersions(db, [...new Set(versionIds)])
  return new Map(rows.map(row => [row.id, row]))
}

/**
 * Makes an attached, published template the shop's default (plan §4): New order starts on it. No
 * `version`: the request says which template, and saying it twice changes nothing; the last choice
 * wins. One batch: clear the old default, set the new one, the guard that it is attached (404
 * otherwise, also for another shop's template), and the audit row.
 */
export async function setDefaultTemplate(db: Db, actor: ShopActor, templateId: string, now = new Date()): Promise<OrderTemplate[]> {
  const { shopId, userId } = actor
  // Attached is enough: archiving detaches, and a draft can't be attached (attachments.service.ts).
  await runBatch(db, [
    ...attachments.setDefaultStatements(db, shopId, templateId),
    requireOneChange(db),
    auditStatement(db, { userId, shopId, requestId: actor.requestId }, { action: 'template.default', targetType: 'template', targetId: templateId }, now),
  ], paperSlipNotFound)
  return orderTemplates(db, actor)
}

/** An image the design draws (its artwork), or 404 when the design doesn't draw it. */
async function designImage(db: Db, design: SlipDesign, imageId: string): Promise<{ bytes: Uint8Array<ArrayBuffer>, type: ImageType }> {
  if (!imagesOf(design).includes(imageId)) throw imageNotFound()
  const [row] = await imagesData(db, [imageId])
  if (!row) throw imageNotFound()
  return { bytes: fromBase64(row.data), type: row.type }
}

/** An image of an attached template's latest version, for the owner's New order form. */
export async function orderTemplateImage(db: Db, actor: ShopActor, options: { templateId: string, imageId: string }) {
  const { templateId, imageId } = options
  const usable = await attachments.orderableTemplatesOfShop(db, actor.shopId)
  if (!usable.some(row => row.templateId === templateId)) throw paperSlipNotFound()
  const latest = await repo.findLatestVersion(db, templateId)
  if (!latest) throw paperSlipNotFound()
  return designImage(db, latest.design, imageId)
}

/**
 * An image of a version, for an order's slip. The caller (orders) has already checked that the
 * version is its own order's: a version is reached only through the shop's order.
 */
export async function versionImage(db: Db, options: { versionId: string, imageId: string }) {
  const { versionId, imageId } = options
  const [version] = await repo.findVersions(db, [versionId])
  if (!version) throw imageNotFound()
  return designImage(db, version.design, imageId)
}
