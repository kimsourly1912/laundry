import { and, eq, sql } from 'drizzle-orm'
import type { ReceiptField, ReceiptImageType } from '#shared/contracts/receipts'
import type { Db, Statement } from '#server/utils/batch'
import { firstRow } from '#server/utils/query'
import { receiptDesigns } from './receipts.schema'

// --- Reads ---

const designColumns = {
  imageType: receiptDesigns.imageType,
  width: receiptDesigns.width,
  height: receiptDesigns.height,
  fields: receiptDesigns.fields,
  version: receiptDesigns.version,
  updatedAt: receiptDesigns.updatedAt,
}

/** The shop's design without its image. */
export function findDesign(db: Db, shopId: string) {
  return firstRow(db.select(designColumns).from(receiptDesigns).where(eq(receiptDesigns.shopId, shopId)))
}

export type DesignRow = NonNullable<Awaited<ReturnType<typeof findDesign>>>

/** The shop's design with its image (base64): to render, or to serve the image. */
export function findDesignWithImage(db: Db, shopId: string) {
  return firstRow(db.select({ ...designColumns, image: receiptDesigns.image }).from(receiptDesigns).where(eq(receiptDesigns.shopId, shopId)))
}

// --- Write statements ---

interface NewImage {
  image: string
  imageType: ReceiptImageType
  width: number
  height: number
}

/** The shop's first design: its background and no fields. Fails on the primary key if one exists. */
export function insertDesignStatement(db: Db, row: NewImage & { shopId: string, now: Date }): Statement {
  const { shopId, image, imageType, width, height, now } = row
  return db.insert(receiptDesigns).values({ shopId, image, imageType, width, height, fields: [], createdAt: now, updatedAt: now })
}

/**
 * Changes the shop's design at `version` and moves it to the next one. Follow with
 * `requireOneChange`: a stale version changes nothing and stops the batch.
 */
export function updateDesignStatement(db: Db, key: { shopId: string, version: number }, update: { set: Partial<NewImage> & { fields?: ReceiptField[] }, now: Date }): Statement {
  const { set, now } = update
  return db.update(receiptDesigns)
    .set({ ...set, updatedAt: now, version: sql`${receiptDesigns.version} + 1` })
    .where(and(eq(receiptDesigns.shopId, key.shopId), eq(receiptDesigns.version, key.version)))
}
