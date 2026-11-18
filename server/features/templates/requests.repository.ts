import { and, asc, count, desc, eq } from 'drizzle-orm'
import type { RequestKind, RequestListQuery, RequestStatus } from '#shared/contracts/template-requests'
import type { ImageType } from '#shared/contracts/templates'
import type { Db, Statement } from '#server/utils/batch'
import { requireOneChange } from '#server/utils/batch'
import { firstRow } from '#server/utils/query'
import { organization } from '#server/db/tables'
import { templateRequests } from './templates.schema'

/**
 * Redesign requests (data-model → template_requests). A shop's functions take its id and filter by
 * it; the platform's queue works across shops on purpose and says so. `photo_data` is read only by
 * the functions that serve the photo.
 */

const requestColumns = {
  id: templateRequests.id,
  shopId: templateRequests.shopId,
  kind: templateRequests.kind,
  notes: templateRequests.notes,
  status: templateRequests.status,
  templateId: templateRequests.templateId,
  photoType: templateRequests.photoType,
  photoWidth: templateRequests.photoWidth,
  photoHeight: templateRequests.photoHeight,
  photoSize: templateRequests.photoSize,
  version: templateRequests.version,
  createdAt: templateRequests.createdAt,
  updatedAt: templateRequests.updatedAt,
}

export interface RequestRow {
  id: string
  shopId: string
  kind: RequestKind
  notes: string
  status: RequestStatus
  templateId: string | null
  photoType: ImageType
  photoWidth: number
  photoHeight: number
  photoSize: number
  version: number
  createdAt: Date
  updatedAt: Date
}

/** The shop's own requests, newest first. */
export function requestsOfShop(db: Db, shopId: string): Promise<RequestRow[]> {
  return db.select(requestColumns).from(templateRequests).where(eq(templateRequests.shopId, shopId)).orderBy(desc(templateRequests.createdAt)).limit(50)
}

/** Across shops (the platform's queue): oldest first, by status, with the shop's name. */
export async function requestQueue(db: Db, query: RequestListQuery) {
  const { status, page, pageSize } = query
  const where = status ? eq(templateRequests.status, status) : undefined
  const [rows, [counted]] = await db.batch([
    db.select({ ...requestColumns, shopName: organization.name }).from(templateRequests)
      .innerJoin(organization, eq(organization.id, templateRequests.shopId))
      .where(where).orderBy(asc(templateRequests.createdAt), asc(templateRequests.id)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(templateRequests).where(where),
  ])
  return { rows, total: counted?.total ?? 0 }
}

/** Across shops (the platform): one request with its shop's name. */
export function findRequest(db: Db, requestId: string) {
  return firstRow(db.select({ ...requestColumns, shopName: organization.name }).from(templateRequests)
    .innerJoin(organization, eq(organization.id, templateRequests.shopId)).where(eq(templateRequests.id, requestId)))
}

/** The photo's bytes, for the shop (its own) or the platform (`shopId` undefined). */
export function findPhoto(db: Db, requestId: string, shopId?: string) {
  return firstRow(db.select({ type: templateRequests.photoType, data: templateRequests.photoData }).from(templateRequests)
    .where(and(eq(templateRequests.id, requestId), shopId ? eq(templateRequests.shopId, shopId) : undefined)))
}

export function insertRequestStatement(db: Db, request: { id: string, shopId: string, userId: string, kind: RequestKind, notes: string, photo: { type: ImageType, width: number, height: number, size: number, data: string }, now: Date }): Statement {
  const { id, shopId, userId, kind, notes, photo, now } = request
  return db.insert(templateRequests).values({ id, shopId, requestedBy: userId, kind, notes, status: 'new', photoType: photo.type, photoWidth: photo.width, photoHeight: photo.height, photoSize: photo.size, photoData: photo.data, version: 1, createdAt: now, updatedAt: now })
}

/** Across shops (the platform): the status at the version read; follow with the guard. */
export function setStatusStatements(db: Db, change: { id: string, version: number, status: RequestStatus, templateId: string | null, now: Date }): Statement[] {
  const { id, version, status, templateId, now } = change
  return [
    db.update(templateRequests).set({ status, templateId, version: version + 1, updatedAt: now })
      .where(and(eq(templateRequests.id, id), eq(templateRequests.version, version))),
    requireOneChange(db),
  ]
}
