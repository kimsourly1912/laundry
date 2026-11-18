import type { Page } from '#shared/contracts/common'
import { toPage } from '#shared/contracts/common'
import type { ImageListQuery, ImageSummary, ImageType, UploadImageQuery } from '#shared/contracts/templates'
import { IMAGE_MAX_BYTES, IMAGE_MAX_SIDE, IMAGE_MIN_SIDE } from '#shared/contracts/templates'
import type { Db } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { auditStatement } from '#server/features/platform'
import type { PlatformActor } from '#server/features/identity'
import { fromBase64, imageInfo, toBase64 } from './images.bytes'
import * as repo from './images.repository'
import type { ImageRow } from './images.repository'
import { imageNotFound, imageSizeOutOfRange, invalidImage, unknownImage } from './templates.errors'
import { renderSlipPng, renderSlipSvg } from './templates.render'
import type { SlipImage } from './templates.render'
import type { SlipData, SlipDesign } from '#shared/contracts/slip-design'
import { imagesOf } from '#shared/slip/svg'

/**
 * The platform's images (plan §5.9): photos of paper slips, pictures on a slip, shop logos. Shared
 * by every template, stored once, base64 in the row (D28). Never deleted while used: S1 has no
 * delete at all.
 */

function toSummary(row: ImageRow): ImageSummary {
  return { ...row, createdAt: row.createdAt.toISOString() }
}

interface Upload {
  bytes: Uint8Array
  name: UploadImageQuery['name']
}

/**
 * Stores an uploaded PNG or JPEG. Its type and size are read from its own bytes, never from the
 * request (D28): anything else is 422 `INVALID_IMAGE`. One batch with its audit row.
 */
export async function uploadImage(db: Db, actor: PlatformActor, upload: Upload, now = new Date()): Promise<ImageSummary> {
  const { bytes } = upload
  if (!bytes.byteLength || bytes.byteLength > IMAGE_MAX_BYTES) throw invalidImage()
  const info = imageInfo(bytes)
  if (!info) throw invalidImage()
  const { type, width, height } = info
  if ([width, height].some(side => side < IMAGE_MIN_SIDE || side > IMAGE_MAX_SIDE)) throw imageSizeOutOfRange()
  const id = newId()
  const name = upload.name || (type === 'image/png' ? 'Image.png' : 'Image.jpg')
  await db.batch([
    repo.insertImageStatement(db, { id, name, type, width, height, size: bytes.byteLength, data: toBase64(bytes), userId: actor.userId, now }),
    auditStatement(db, { userId: actor.userId, shopId: null, requestId: actor.requestId }, { action: 'image.upload', targetType: 'image', targetId: id, data: { type, width, height, size: bytes.byteLength } }, now),
  ])
  return toSummary((await repo.findImage(db, id))!)
}

export async function listImages(db: Db, query: ImageListQuery): Promise<Page<ImageSummary>> {
  const { rows, total } = await repo.listImages(db, query)
  return toPage(rows.map(toSummary), query, total)
}

export async function getImage(db: Db, imageId: string): Promise<ImageSummary> {
  const row = await repo.findImage(db, imageId)
  if (!row) throw imageNotFound()
  return toSummary(row)
}

/** The image's bytes as uploaded, for the studio to draw. */
export async function imageBytes(db: Db, imageId: string): Promise<{ bytes: Uint8Array<ArrayBuffer>, type: ImageType }> {
  const [row] = await repo.imagesData(db, [imageId])
  if (!row) throw imageNotFound()
  return { bytes: fromBase64(row.data), type: row.type }
}

/**
 * 422 `UNKNOWN_IMAGE` unless every image exists. `paths` names where each id came from, so the
 * error points at it (`design.background.imageId`).
 */
export async function requireImages(db: Db, references: ReadonlyMap<string, string>): Promise<void> {
  if (!references.size) return
  const existing = await repo.existingImageIds(db, [...references.keys()])
  for (const [id, path] of references) {
    if (!existing.has(id)) throw unknownImage(path)
  }
}

/** The images a slip draws, by id, to render it. */
export async function slipImages(db: Db, imageIds: readonly string[]): Promise<Map<string, SlipImage>> {
  const rows = await repo.imagesData(db, imageIds)
  return new Map(rows.map(row => [row.id, { type: row.type, data: row.data }]))
}

/** A filled slip as SVG, either kind (D39): the order page, New order's preview of an HTML slip, print. */
export async function renderFilledSlipSvg(db: Db, slip: { design: SlipDesign, data: SlipData }): Promise<string> {
  const { design, data } = slip
  return renderSlipSvg({ design, data, images: await slipImages(db, imagesOf(design)) })
}

/** A filled slip as the customer's PNG, with the images its design draws (Telegram, plan step 4). */
export async function renderFilledSlip(db: Db, slip: { design: SlipDesign, data: SlipData }): Promise<Uint8Array<ArrayBuffer>> {
  const { design, data } = slip
  return renderSlipPng({ design, data, images: await slipImages(db, imagesOf(design)) })
}
