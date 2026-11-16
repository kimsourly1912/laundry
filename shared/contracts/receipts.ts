import * as v from 'valibot'
import { idSchema, versionSchema } from './common'

/**
 * A shop's receipt design (`/api/platform/shops/:shopId/receipt`, D28): the shop's own slip artwork
 * as the background, and fields placed on it, each bound to the order's data. The server fills
 * the fields with an order and renders a PNG for Telegram (`#shared/receipt-fields`). One design per
 * shop, kept by the platform like the price list (D26). Positions and sizes are in the
 * background's pixels.
 */

/** The background: PNG or JPEG, at most 1 MB, at most 2000 × 2000 pixels. */
export const RECEIPT_IMAGE_TYPES = ['image/png', 'image/jpeg'] as const
export type ReceiptImageType = typeof RECEIPT_IMAGE_TYPES[number]
export const MAX_RECEIPT_IMAGE_BYTES = 1_000_000
export const MAX_RECEIPT_SIDE = 2000
export const MIN_RECEIPT_SIDE = 200
/** Fields on one receipt: a full slip grid (items × services) and the order's details. */
export const MAX_RECEIPT_FIELDS = 300

/**
 * What a text field shows: the shop's name, the order number, the date it was made, the person
 * (name, else phone, else "Walk-in"), their phone, the total, paid or not paid, the note.
 */
export const RECEIPT_TEXT_SOURCES = ['shopName', 'number', 'date', 'customer', 'phone', 'total', 'payment', 'note'] as const
export type ReceiptTextSource = typeof RECEIPT_TEXT_SOURCES[number]

export const RECEIPT_ALIGNS = ['start', 'middle', 'end'] as const
export type ReceiptAlign = typeof RECEIPT_ALIGNS[number]

const coordinate = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(MAX_RECEIPT_SIDE))

/** Every field: where (the text's baseline point, or a check mark's top-left corner), how big, what colour. */
const placement = {
  /** Unique in the design; the designer makes it. */
  id: v.pipe(v.string(), v.regex(/^[\w-]{1,40}$/, 'Must be a short key')),
  x: coordinate,
  y: coordinate,
  /** Text: font size; check mark: its side. In pixels. */
  size: v.pipe(v.number(), v.integer(), v.minValue(8), v.maxValue(400)),
  color: v.pipe(v.string(), v.regex(/^#[\da-f]{6}$/i, 'Must be a colour like #1f2937')),
}

const textStyle = {
  align: v.picklist(RECEIPT_ALIGNS),
  bold: v.boolean(),
}

export const receiptFieldSchema = v.variant('kind', [
  /** One of the order's details. */
  v.strictObject({ kind: v.literal('text'), ...placement, ...textStyle, source: v.picklist(RECEIPT_TEXT_SOURCES) }),
  /** How many of a price item the order has (pieces, or kg); blank when none. */
  v.strictObject({ kind: v.literal('quantity'), ...placement, ...textStyle, priceItemId: idSchema }),
  /** A tick when the order is paid, or when it isn't (the slip's paid / not paid boxes). */
  v.strictObject({ kind: v.literal('check'), ...placement, when: v.picklist(['paid', 'unpaid']) }),
  /** A tick when the order has any item of this service (the slip's service boxes). */
  v.strictObject({ kind: v.literal('serviceCheck'), ...placement, serviceTypeId: idSchema }),
])
export type ReceiptField = v.InferOutput<typeof receiptFieldSchema>
export type ReceiptFieldKind = ReceiptField['kind']

export const receiptFieldsSchema = v.pipe(
  v.array(receiptFieldSchema),
  v.maxLength(MAX_RECEIPT_FIELDS, `At most ${MAX_RECEIPT_FIELDS} fields`),
  v.check(fields => new Set(fields.map(field => field.id)).size === fields.length, 'Each field needs its own key'),
)

/** `PATCH /api/platform/shops/:shopId/receipt`: the whole field list, at the version read. */
export const updateReceiptSchema = v.strictObject({ version: versionSchema, fields: receiptFieldsSchema })
export type UpdateReceiptInput = v.InferOutput<typeof updateReceiptSchema>

/** `POST …/receipt/preview`: the fields as they are on screen, rendered with sample data. */
export const previewReceiptSchema = v.strictObject({ fields: receiptFieldsSchema })
export type PreviewReceiptInput = v.InferOutput<typeof previewReceiptSchema>

/**
 * `PUT …/receipt/background?version=`: the image is the body (`Content-Type` image/png or
 * image/jpeg). Without `version` it makes the shop's design; with it, it replaces the background
 * of the design at that version and keeps the fields.
 */
export const backgroundQuerySchema = v.object({
  version: v.optional(v.pipe(v.string(), v.regex(/^\d+$/, 'Must be a whole number'), v.transform(Number), v.minValue(1))),
})

/** The shop's design (`GET …/receipt`): `null` until a background is uploaded. */
export interface ReceiptDesign {
  width: number
  height: number
  imageType: ReceiptImageType
  fields: ReceiptField[]
  version: number
  updatedAt: string
}

export interface ReceiptDesignResponse {
  design: ReceiptDesign | null
}
