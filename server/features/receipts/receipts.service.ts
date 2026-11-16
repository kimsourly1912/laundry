import type { PreviewReceiptInput, ReceiptDesign, ReceiptDesignResponse, ReceiptField, UpdateReceiptInput, ReceiptImageType } from '#shared/contracts/receipts'
import { MAX_RECEIPT_IMAGE_BYTES, MAX_RECEIPT_SIDE, MIN_RECEIPT_SIDE } from '#shared/contracts/receipts'
import type { Db, Statement } from '#server/utils/batch'
import { isUniqueViolation, requireOneChange, runBatch } from '#server/utils/batch'
import { auditStatement } from '#server/features/platform'
import { priceItemsForLines, shopPriceIds } from '#server/features/pricing'
import { shopProfile } from '#server/features/shops'
import type { ShopProfile } from '#server/features/shops'
import { orderInShop } from '#server/features/orders'
import type { ShopActor } from '#server/features/identity'
import { designChanged, designExists, designNotFound, imageSizeOutOfRange, invalidImage, unknownReference } from './receipts.errors'
import { fromBase64, imageInfo, toBase64 } from './receipts.image'
import { renderReceiptPng } from './receipts.render'
import * as repo from './receipts.repository'
import type { DesignRow } from './receipts.repository'
import { orderValues, sampleValues } from './receipts.values'

/**
 * A shop's receipt design (D28): the platform uploads the shop's slip artwork and places fields on
 * it; each order's receipt is that design filled with the order and rendered to a PNG. The platform
 * acts in the shop named in the path, checked to exist (`platformShopActor`, as for the price list,
 * D26); each write is one batch with its audit row in that shop's history.
 */

/** The platform acting in one shop (`platformShopActor`). */
export interface ReceiptActor {
  userId: string
  shopId: string
  requestId?: string
}

function audit(db: Db, actor: ReceiptActor, action: string, data?: Record<string, unknown>, now = new Date()): Statement {
  return auditStatement(db, { userId: actor.userId, shopId: actor.shopId, requestId: actor.requestId }, { action, targetType: 'receipt', targetId: actor.shopId, data }, now)
}

function toDesign(row: DesignRow): ReceiptDesign {
  const { imageType, width, height, fields, version, updatedAt } = row
  return { imageType, width, height, fields, version, updatedAt: updatedAt.toISOString() }
}

export async function getReceiptDesign(db: Db, actor: ReceiptActor): Promise<ReceiptDesignResponse> {
  const row = await repo.findDesign(db, actor.shopId)
  return { design: row ? toDesign(row) : null }
}

async function requireShop(db: Db, shopId: string): Promise<ShopProfile> {
  const shop = await shopProfile(db, shopId)
  if (!shop) throw designNotFound()
  return shop
}

interface BackgroundUpload {
  bytes: Uint8Array
  /** Absent: make the shop's design. Present: replace the background of the design at this version. */
  version?: number
}

/**
 * Sets the shop's background image. Its type and size come from the file itself, never from the
 * request's headers. Replacing it keeps the fields where they are (in pixels): the admin moves
 * them if the new image differs.
 */
export async function uploadReceiptBackground(db: Db, actor: ReceiptActor, upload: BackgroundUpload, now = new Date()): Promise<ReceiptDesign> {
  const { bytes, version } = upload
  const { shopId } = actor
  if (bytes.byteLength > MAX_RECEIPT_IMAGE_BYTES) throw invalidImage()
  const info = imageInfo(bytes)
  if (!info) throw invalidImage()
  const { type: imageType, width, height } = info
  if ([width, height].some(side => side < MIN_RECEIPT_SIDE || side > MAX_RECEIPT_SIDE)) throw imageSizeOutOfRange()
  const image = { image: toBase64(bytes), imageType, width, height }
  const data = { imageType, width, height, bytes: bytes.byteLength }
  const existing = await repo.findDesign(db, shopId)
  if (version === undefined && existing) throw designExists()
  if (version !== undefined && !existing) throw designNotFound()

  if (version === undefined) {
    try {
      await db.batch([repo.insertDesignStatement(db, { shopId, ...image, now }), audit(db, actor, 'receipt.background', data, now)])
    }
    catch (error) {
      if (isUniqueViolation(error)) throw designExists()
      throw error
    }
  }
  else {
    await runBatch(db, [
      repo.updateDesignStatement(db, { shopId, version }, { set: image, now }),
      requireOneChange(db),
      audit(db, actor, 'receipt.background', data, now),
    ], designChanged)
  }
  return toDesign((await repo.findDesign(db, shopId))!)
}

/** Every field names only this shop's price items and service types. */
async function checkReferences(db: Db, shopId: string, fields: readonly ReceiptField[]): Promise<void> {
  const priceItemIds = [...new Set(fields.flatMap(field => (field.kind === 'quantity' ? [field.priceItemId] : [])))]
  const serviceTypeIds = [...new Set(fields.flatMap(field => (field.kind === 'serviceCheck' ? [field.serviceTypeId] : [])))]
  const known = await shopPriceIds(db, shopId, { priceItemIds, serviceTypeIds })
  const unknown = fields.findIndex(field =>
    (field.kind === 'quantity' && !known.priceItemIds.has(field.priceItemId))
    || (field.kind === 'serviceCheck' && !known.serviceTypeIds.has(field.serviceTypeId)))
  if (unknown >= 0) throw unknownReference(`fields.${unknown}`)
}

/** Replaces the design's fields, at the version the admin read. */
export async function updateReceiptFields(db: Db, actor: ReceiptActor, input: UpdateReceiptInput, now = new Date()): Promise<ReceiptDesign> {
  const { shopId } = actor
  const { version, fields } = input
  if (!await repo.findDesign(db, shopId)) throw designNotFound()
  await checkReferences(db, shopId, fields)
  await runBatch(db, [
    repo.updateDesignStatement(db, { shopId, version }, { set: { fields }, now }),
    requireOneChange(db),
    audit(db, actor, 'receipt.update', { fields: fields.length }, now),
  ], designChanged)
  return toDesign((await repo.findDesign(db, shopId))!)
}

/** The background image as uploaded, to show in the designer. */
export async function receiptBackground(db: Db, actor: ReceiptActor): Promise<{ bytes: Uint8Array<ArrayBuffer>, type: ReceiptImageType }> {
  const row = await repo.findDesignWithImage(db, actor.shopId)
  if (!row) throw designNotFound()
  return { bytes: fromBase64(row.image), type: row.imageType }
}

/** The fields on screen (saved or not), rendered over the background with made-up values. */
export async function previewReceipt(db: Db, actor: ReceiptActor, input: PreviewReceiptInput, now = new Date()): Promise<Uint8Array<ArrayBuffer>> {
  const { shopId } = actor
  const [row, shop] = await Promise.all([repo.findDesignWithImage(db, shopId), requireShop(db, shopId)])
  if (!row) throw designNotFound()
  await checkReferences(db, shopId, input.fields)
  return renderReceiptPng(row, input.fields, sampleValues(input.fields, shop, now))
}

/**
 * An order's receipt as a PNG, or `null` when the shop has no design yet. For work without a
 * signed-in user (Telegram): the shop's id comes from a trusted place, never a request.
 */
export async function renderOrderReceipt(db: Db, shopId: string, orderId: string): Promise<Uint8Array<ArrayBuffer> | null> {
  // The order first: another shop's order is 404 whether or not this shop has a design.
  const order = await orderInShop(db, shopId, orderId)
  const [row, shop] = await Promise.all([repo.findDesignWithImage(db, shopId), requireShop(db, shopId)])
  if (!row) return null
  const ids = [...new Set(order.lines.flatMap(line => (line.priceItemId ? [line.priceItemId] : [])))]
  const serviceOf = new Map((await priceItemsForLines(db, shopId, ids)).map(item => [item.id, item.serviceTypeId]))
  return renderReceiptPng(row, row.fields, orderValues(order, shop, serviceOf))
}

/** `GET /api/shop/orders/:id/receipt`: the shop's own order's receipt. 404 without a design. */
export async function orderReceipt(db: Db, actor: ShopActor, orderId: string): Promise<Uint8Array<ArrayBuffer>> {
  const png = await renderOrderReceipt(db, actor.shopId, orderId)
  if (!png) throw designNotFound()
  return png
}
