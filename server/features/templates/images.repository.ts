import { count, desc, eq, inArray } from 'drizzle-orm'
import type { ImageListQuery, ImageType } from '#shared/contracts/templates'
import type { Db, Statement } from '#server/utils/batch'
import { readInChunks } from '#server/utils/batch'
import { firstRow } from '#server/utils/query'
import { images } from './templates.schema'

/**
 * The platform's uploaded images (data-model → images). A platform table: no `shop_id`. **Only the
 * functions that draw or serve an image read `data`** (up to 1.34 MB of base64 a row).
 */

const imageColumns = {
  id: images.id,
  name: images.name,
  type: images.type,
  width: images.width,
  height: images.height,
  size: images.size,
  createdAt: images.createdAt,
}

export interface ImageRow {
  id: string
  name: string
  type: ImageType
  width: number
  height: number
  size: number
  createdAt: Date
}

export interface ImageDataRow {
  id: string
  type: ImageType
  /** Base64. */
  data: string
}

// --- Reads ---

export function findImage(db: Db, imageId: string): Promise<ImageRow | undefined> {
  return firstRow(db.select(imageColumns).from(images).where(eq(images.id, imageId)))
}

/** Newest first (`images_created_idx`), a page at a time. */
export async function listImages(db: Db, query: ImageListQuery): Promise<{ rows: ImageRow[], total: number }> {
  const { page, pageSize } = query
  const [rows, [counted]] = await db.batch([
    db.select(imageColumns).from(images).orderBy(desc(images.createdAt), desc(images.id)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(images),
  ])
  return { rows, total: counted?.total ?? 0 }
}

/** The size in bytes of each of these images that exists, by id. */
export async function imageSizes(db: Db, imageIds: readonly string[]): Promise<Map<string, number>> {
  const rows = await readInChunks(imageIds, ids => db.select({ id: images.id, size: images.size }).from(images).where(inArray(images.id, ids)))
  return new Map(rows.map(row => [row.id, row.size]))
}

/** The images' bytes (base64), to draw them. */
export function imagesData(db: Db, imageIds: readonly string[]): Promise<ImageDataRow[]> {
  return readInChunks(imageIds, ids => db.select({ id: images.id, type: images.type, data: images.data }).from(images).where(inArray(images.id, ids)))
}

// --- Write statements ---

interface NewImage {
  id: string
  name: string
  type: ImageType
  width: number
  height: number
  size: number
  data: string
  userId: string
  now: Date
}

export function insertImageStatement(db: Db, image: NewImage): Statement {
  const { userId, now, ...values } = image
  return db.insert(images).values({ ...values, createdBy: userId, createdAt: now })
}
