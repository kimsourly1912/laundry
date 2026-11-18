import * as v from 'valibot'
import { idSchema, nameSchema, optionalParam, pageQuerySchema, versionSchema } from './common'
import { canvasSideSchema, designSchema } from './slip-design'
import type { SlipDesign } from './slip-design'

/**
 * Slip templates and their images (`/api/platform/templates`, `/api/platform/images`; plan §5, S1).
 * The platform designs a template in the studio: the draft saves itself at the version read, and
 * each Publish fixes it as a new version, which orders keep forever (plan §4).
 */

export const TEMPLATE_STATUSES = ['draft', 'published', 'archived'] as const
export type TemplateStatus = typeof TEMPLATE_STATUSES[number]

export const TEMPLATE_NAME_MAX = 80
export const templateNameSchema = nameSchema(TEMPLATE_NAME_MAX, 'Template name')

/** How a new template starts (plan §5.2, D35). */
export const templateStartSchema = v.variant('kind', [
  /** An uploaded artwork (made by AI or a designer): the canvas takes its size. */
  v.strictObject({ kind: v.literal('artwork'), imageId: idSchema }),
  /** Another template's draft, as a new draft. */
  v.strictObject({ kind: v.literal('copy'), templateId: idSchema }),
  /**
   * D39: an HTML slip (an AI's answer, or a sample to start from), on a canvas of this size, with the
   * usual owner fields to start from: phone, amount, paid or not. The Studio adds counts.
   */
  v.strictObject({ kind: v.literal('html'), html: v.pipe(v.string(), v.maxLength(64 * 1024)), width: canvasSideSchema, height: canvasSideSchema }),
])
export type TemplateStart = v.InferOutput<typeof templateStartSchema>

/** `POST /api/platform/templates`. */
export const createTemplateSchema = v.strictObject({
  name: templateNameSchema,
  start: templateStartSchema,
})
export type CreateTemplateInput = v.InferOutput<typeof createTemplateSchema>

/** `PATCH /api/platform/templates/:id`: the studio's autosave, at the version it read (plan §5.8). */
export const updateTemplateSchema = v.pipe(
  v.strictObject({
    version: versionSchema,
    name: v.optional(templateNameSchema),
    design: v.optional(designSchema),
  }),
  v.check(input => input.name !== undefined || input.design !== undefined, 'Nothing to save'),
)
export type UpdateTemplateInput = v.InferOutput<typeof updateTemplateSchema>

/** `POST …/publish`: fixes the draft at this version as the next template version. */
export const publishTemplateSchema = v.strictObject({ version: versionSchema })
export type PublishTemplateInput = v.InferOutput<typeof publishTemplateSchema>

/** `POST …/preview`: the design on screen (saved or not), drawn by the server with sample values. */
export const previewTemplateSchema = v.strictObject({
  design: designSchema,
  /** D39: which sample order to draw it with; typical by default. */
  sample: v.optional(v.picklist(['blank', 'typical', 'crowded']), 'typical'),
})
export type PreviewTemplateInput = v.InferOutput<typeof previewTemplateSchema>

/** `GET /api/platform/templates?status=&search=&page=&pageSize=`: search is the name. */
export const templateListQuerySchema = v.object({
  ...pageQuerySchema,
  status: optionalParam(v.picklist(TEMPLATE_STATUSES)),
  search: optionalParam(v.pipe(v.string(), v.trim(), v.maxLength(TEMPLATE_NAME_MAX))),
})
export type TemplateListQuery = v.InferOutput<typeof templateListQuerySchema>

/** A template in the platform's list. */
export interface TemplateSummary {
  id: string
  name: string
  status: TemplateStatus
  /** The draft's canvas. */
  width: number
  height: number
  /** The latest published version's number, `null` before the first Publish. */
  latestVersion: number | null
  /** How many shops it's attached to. */
  shopCount: number
  /** Send it back with every change (409 when the template changed meanwhile). */
  version: number
  /** ISO 8601. */
  createdAt: string
  updatedAt: string
}

/** In the platform's list: the draft too, for the thumbnail. */
export interface TemplateListItem extends TemplateSummary {
  design: SlipDesign
}

/** One template, with its draft (`GET …/:id`, and the answer to every change). */
export interface TemplateDetail extends TemplateSummary {
  design: SlipDesign
  /** Whether the draft differs from the latest version: Publish has something to fix. */
  hasUnpublishedChanges: boolean
}

/** `POST …/archive` and `…/restore`: the version the platform saw. */
export const templateStatusChangeSchema = v.strictObject({ version: versionSchema })
export type TemplateStatusChangeInput = v.InferOutput<typeof templateStatusChangeSchema>

// --- Attachments (plan §4, step 2) ---

/** `POST /api/platform/templates/:id/shops`: attaches a published template to a shop. */
export const attachTemplateSchema = v.strictObject({ shopId: idSchema })
export type AttachTemplateInput = v.InferOutput<typeof attachTemplateSchema>

/** A shop a template is attached to (`GET …/templates/:id/shops`). */
export interface TemplateShop {
  shopId: string
  name: string
  /** The shop's owner chose it as the default (step 3). */
  isDefault: boolean
  attachedAt: string
}

/** A template attached to a shop (`GET /api/platform/shops/:shopId/templates`). */
export interface ShopTemplate {
  templateId: string
  name: string
  status: TemplateStatus
  isDefault: boolean
  attachedAt: string
}

// --- Images (plan §5.9) ---

export const IMAGE_TYPES = ['image/png', 'image/jpeg'] as const
export type ImageType = typeof IMAGE_TYPES[number]
export const IMAGE_MAX_BYTES = 1024 * 1024
export const IMAGE_MIN_SIDE = 200
export const IMAGE_MAX_SIDE = 2000
/** Under this on its long side, the customer's image looks soft (plan §5.2): the studio warns. */
export const IMAGE_SOFT_SIDE = 1000
export const IMAGE_NAME_MAX = 100

/**
 * `POST /api/platform/images?name=`: the file is the body. Its type and size are read from its own
 * bytes, never from `Content-Type` (D28).
 */
export const uploadImageQuerySchema = v.object({
  name: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(IMAGE_NAME_MAX, `At most ${IMAGE_NAME_MAX} characters`)), ''),
})
export type UploadImageQuery = v.InferOutput<typeof uploadImageQuerySchema>

export const imageListQuerySchema = v.object({ ...pageQuerySchema })
export type ImageListQuery = v.InferOutput<typeof imageListQuerySchema>

/** An uploaded image: its bytes are at `GET /api/platform/images/:id`. */
export interface ImageSummary {
  id: string
  name: string
  type: ImageType
  width: number
  height: number
  /** Bytes. */
  size: number
  createdAt: string
}
