import * as v from 'valibot'
import { idSchema, optionalParam, pageQuerySchema, versionSchema } from './common'
import type { ImageType } from './templates'

/**
 * Redesign requests (D39; product notes → AI-assisted design; guide → sheets 05, 09): an owner
 * sends a photo of their paper slip with "keep the layout" or "redesign it" and notes; the platform
 * works through them in a queue. The photo is private: only its shop and the platform see it.
 */

export const REQUEST_KINDS = ['keep', 'redesign'] as const
export type RequestKind = typeof REQUEST_KINDS[number]

export const REQUEST_STATUSES = ['new', 'in_progress', 'done', 'declined'] as const
export type RequestStatus = typeof REQUEST_STATUSES[number]

export const REQUEST_NOTES_MAX = 1000

/** `POST /api/shop/template-requests?kind=&notes=`: the photo is the body (PNG or JPEG, ≤ 1 MB). */
export const createRequestQuerySchema = v.object({
  kind: v.picklist(REQUEST_KINDS),
  notes: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(REQUEST_NOTES_MAX, `At most ${REQUEST_NOTES_MAX} characters`)), ''),
})
export type CreateRequestQuery = v.InferOutput<typeof createRequestQuerySchema>

/** `GET /api/platform/template-requests?status=`: the queue, oldest first. */
export const requestListQuerySchema = v.object({
  ...pageQuerySchema,
  status: optionalParam(v.picklist(REQUEST_STATUSES)),
})
export type RequestListQuery = v.InferOutput<typeof requestListQuerySchema>

/** `POST /api/platform/template-requests/:id/status`: where the platform is with it, at the version read; `done` may name the template made. */
export const requestStatusSchema = v.strictObject({
  version: versionSchema,
  status: v.picklist(REQUEST_STATUSES),
  templateId: v.optional(v.nullable(idSchema), null),
})
export type RequestStatusInput = v.InferOutput<typeof requestStatusSchema>

export interface TemplateRequest {
  id: string
  kind: RequestKind
  notes: string
  status: RequestStatus
  /** The template the platform made for it, once done. */
  templateId: string | null
  photo: { type: ImageType, width: number, height: number, size: number }
  version: number
  /** ISO 8601. */
  createdAt: string
  updatedAt: string
}

/** In the platform's queue: whose it is. */
export interface PlatformTemplateRequest extends TemplateRequest {
  shopId: string
  shopName: string
}
