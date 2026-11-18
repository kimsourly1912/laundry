import type { Page } from '#shared/contracts/common'
import { toPage } from '#shared/contracts/common'
import type { CreateRequestQuery, PlatformTemplateRequest, RequestListQuery, RequestStatusInput, TemplateRequest } from '#shared/contracts/template-requests'
import { IMAGE_MAX_BYTES, IMAGE_MAX_SIDE, IMAGE_MIN_SIDE } from '#shared/contracts/templates'
import type { Db } from '#server/utils/batch'
import { runBatch } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { notFound, versionConflict } from '#server/utils/errors'
import { auditStatement } from '#server/features/platform'
import type { PlatformActor, ShopActor } from '#server/features/identity'
import { fromBase64, imageInfo, toBase64 } from './images.bytes'
import * as repo from './requests.repository'
import type { RequestRow } from './requests.repository'
import { findTemplate } from './templates.repository'
import { imageSizeOutOfRange, invalidImage, templateNotFound } from './templates.errors'

/**
 * Redesign requests (D39; product notes → AI-assisted design): an owner asks for a new slip or a
 * change, with a photo of their paper slip; the platform works through the queue and, when done,
 * names the template it made (it attaches it to the shop as usual, step 2). The photo stays with
 * its shop and the platform; it's checked like an uploaded image (type and size from its bytes).
 */

const requestNotFound = () => notFound('This request')

function toRequest(row: RequestRow): TemplateRequest {
  const { id, kind, notes, status, templateId, photoType, photoWidth, photoHeight, photoSize, version, createdAt, updatedAt } = row
  return { id, kind, notes, status, templateId, photo: { type: photoType, width: photoWidth, height: photoHeight, size: photoSize }, version, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() }
}

/** A new request from the shop, with its photo (PNG or JPEG, ≤ 1 MB, 200–2000 px a side; 422 otherwise). */
export async function createRequest(db: Db, actor: ShopActor, upload: { bytes: Uint8Array, query: CreateRequestQuery }, now = new Date()): Promise<TemplateRequest> {
  const { bytes, query } = upload
  if (!bytes.byteLength || bytes.byteLength > IMAGE_MAX_BYTES) throw invalidImage()
  const info = imageInfo(bytes)
  if (!info) throw invalidImage()
  if ([info.width, info.height].some(side => side < IMAGE_MIN_SIDE || side > IMAGE_MAX_SIDE)) throw imageSizeOutOfRange()
  const { shopId, userId } = actor
  const id = newId()
  await db.batch([
    repo.insertRequestStatement(db, { id, shopId, userId, kind: query.kind, notes: query.notes, photo: { ...info, size: bytes.byteLength, data: toBase64(bytes) }, now }),
    auditStatement(db, { userId, shopId, requestId: actor.requestId }, { action: 'template.request', targetType: 'template_request', targetId: id, data: { kind: query.kind } }, now),
  ])
  const [row] = (await repo.requestsOfShop(db, shopId)).filter(item => item.id === id)
  return toRequest(row!)
}

export async function shopRequests(db: Db, actor: ShopActor): Promise<TemplateRequest[]> {
  return (await repo.requestsOfShop(db, actor.shopId)).map(toRequest)
}

/** The photo: the shop's own (`actor` a shop), or any (the platform). Another shop's is 404. */
export async function requestPhoto(db: Db, requestId: string, shopId?: string) {
  const row = await repo.findPhoto(db, requestId, shopId)
  if (!row) throw requestNotFound()
  return { bytes: fromBase64(row.data), type: row.type }
}

export async function requestQueue(db: Db, query: RequestListQuery): Promise<Page<PlatformTemplateRequest>> {
  const { rows, total } = await repo.requestQueue(db, query)
  return toPage(rows.map(row => ({ ...toRequest(row), shopId: row.shopId, shopName: row.shopName })), query, total)
}

export async function getRequest(db: Db, requestId: string): Promise<PlatformTemplateRequest> {
  const row = await repo.findRequest(db, requestId)
  if (!row) throw requestNotFound()
  return { ...toRequest(row), shopId: row.shopId, shopName: row.shopName }
}

/** The platform moves a request on, at the version read; `done` may name the template made (404 for none). Audited. */
export async function setRequestStatus(db: Db, actor: PlatformActor, requestId: string, input: RequestStatusInput, now = new Date()): Promise<PlatformTemplateRequest> {
  const before = await repo.findRequest(db, requestId)
  if (!before) throw requestNotFound()
  if (input.templateId && !await findTemplate(db, input.templateId)) throw templateNotFound()
  await runBatch(db, [
    ...repo.setStatusStatements(db, { id: requestId, version: input.version, status: input.status, templateId: input.templateId, now }),
    auditStatement(db, { userId: actor.userId, shopId: null, requestId: actor.requestId }, { action: 'template.request.status', targetType: 'template_request', targetId: requestId, data: { from: before.status, to: input.status } }, now),
  ], () => versionConflict('This request'))
  return getRequest(db, requestId)
}
