import * as v from 'valibot'
import { idSchema } from './common'

/**
 * A slip design (plan §5, §6.1, D35): one JSON document, the artwork and the form fields on it.
 * The studio edits it, the server stores it as a template's draft and fixes it in each published
 * version, and the shared SVG builder (`#shared/slip/svg`) draws it. This schema checks it in the
 * browser and on the server.
 *
 * The slip's look is the artwork, made outside the app (D35); the elements are the fields the
 * owner's values are drawn in. Every field is an upright box (x, y, w, h) in canvas pixels. Element
 * and group ids are short keys the studio makes, unique in the design; an order's values are
 * stored by them (`SlipValues`).
 *
 * The schema checks shape and bounds only. What a template needs before it can be published (an
 * Order No., labels, …) is checked by `publishProblems` (`#shared/slip/checks`).
 */

export const CANVAS_MIN_SIDE = 200
export const CANVAS_MAX_SIDE = 2000
/** Fields on one slip: a dense paper slip has about a hundred boxes. */
export const MAX_ELEMENTS = 300
export const MAX_GROUPS = 50
/** The draft as JSON, at most: the template's save and preview requests carry it (plan §5.6). */
export const MAX_DESIGN_BYTES = 256 * 1024

export const ALIGNS = ['left', 'center', 'right'] as const
export type Align = typeof ALIGNS[number]

/** How a ticked checkbox or a chosen option is drawn (plan §5.3.2). */
export const MARKS = ['tick', 'cross', 'dot', 'box'] as const
export type Mark = typeof MARKS[number]

export const canvasSideSchema = v.pipe(v.number(), v.integer('Must be a whole number'), v.minValue(CANVAS_MIN_SIDE, `At least ${CANVAS_MIN_SIDE} px`), v.maxValue(CANVAS_MAX_SIDE, `At most ${CANVAS_MAX_SIDE} px`))

/** An element or group id: made by the studio, unique in the design. */
export const keySchema = v.pipe(v.string(), v.regex(/^[\w-]{1,40}$/, 'Must be a short key'))

export const colorSchema = v.pipe(v.string(), v.regex(/^#[\da-f]{6}$/i, 'Must be a colour like #1f2937'))

function bounded(min: number, max: number) {
  return v.pipe(v.number(), v.finite(), v.minValue(min), v.maxValue(max))
}

/** Positions may leave the canvas (a field partly off it is a publish warning, plan §5.6). */
const coordinate = bounded(-10_000, 10_000)
const extent = bounded(1, 10_000)
const fontSize = bounded(6, 400)

const base = {
  id: keySchema,
  x: coordinate,
  y: coordinate,
  w: extent,
  h: extent,
}

/** What the owner sees while filling (plan §5.3.1): one free-text label, Khmer if the shop reads Khmer (D36). Required to publish. */
export const labelSchema = v.pipe(v.string(), v.trim(), v.maxLength(60, 'At most 60 characters'))
export type Label = v.InferOutput<typeof labelSchema>

/** How a value is drawn inside its box (plan §5.3.1). */
const valueStyle = {
  size: fontSize,
  bold: v.boolean(),
  color: colorSchema,
  align: v.picklist(ALIGNS),
}

/** "Draw a border": a thin box, for designs with no printed box (plan §5.3.1). */
const border = { border: v.boolean() }

/** Number fields: 0–999 by default (plan §5.3.2). */
export const NUMBER_LIMIT = 1_000_000
export const TEXT_FIELD_MAX = 200

export const elementSchema = v.variant('type', [
  // --- Fields the owner fills (plan §5.3.2) ---
  v.strictObject({
    ...base,
    type: v.literal('number'),
    label: labelSchema,
    required: v.boolean(),
    ...valueStyle,
    ...border,
    /** 0: whole numbers; 1 or 2: decimal places. */
    decimals: v.picklist([0, 1, 2]),
    min: bounded(-NUMBER_LIMIT, NUMBER_LIMIT),
    max: bounded(-NUMBER_LIMIT, NUMBER_LIMIT),
    /** Drawn after the value (`kg`); empty for none. */
    unit: v.pipe(v.string(), v.trim(), v.maxLength(10)),
    /**
     * A price-list key (D39): the count is priced by the shop's item of that key, per piece or per
     * kg, and the order's amount is the server's total. Absent: a plain count.
     */
    priceKey: v.optional(v.pipe(v.string(), v.regex(/^[a-z\d][a-z\d._-]{0,39}$/, 'Letters, digits, dots and dashes'))),
  }),
  v.strictObject({
    ...base,
    type: v.literal('textField'),
    label: labelSchema,
    required: v.boolean(),
    ...valueStyle,
    ...border,
    maxLength: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(TEXT_FIELD_MAX)),
  }),
  v.strictObject({ ...base, type: v.literal('checkbox'), label: labelSchema, required: v.boolean(), ...border, mark: v.picklist(MARKS), color: colorSchema }),
  /** One spot of a choice group (`groups`): the group's mark is drawn here when it's the chosen one. */
  v.strictObject({ ...base, type: v.literal('option'), group: keySchema, label: labelSchema, ...border, color: colorSchema }),

  // --- Fixed-meaning fields, at most one of each (plan §5.3.3) ---
  /** Filled by the server: the shop's order number. */
  v.strictObject({ ...base, type: v.literal('orderNo'), ...valueStyle, ...border }),
  /** Filled by the server: the shop's day the order was made. */
  v.strictObject({ ...base, type: v.literal('date'), ...valueStyle, ...border }),
  v.strictObject({ ...base, type: v.literal('phone'), label: labelSchema, required: v.boolean(), ...valueStyle, ...border }),
  /** In the order's currency (the copy of the shop's details). */
  v.strictObject({ ...base, type: v.literal('amount'), label: labelSchema, required: v.boolean(), ...valueStyle, ...border }),
  /** The "Paid" spot and the "Not paid" spot: the owner's choice is the order's `paid`. */
  v.strictObject({ ...base, type: v.literal('paid'), value: v.picklist(['paid', 'unpaid']), label: labelSchema, ...border, mark: v.picklist(MARKS), color: colorSchema }),
])
export type SlipElement = v.InferOutput<typeof elementSchema>
export type ElementType = SlipElement['type']
export type ElementOf<T extends ElementType> = Extract<SlipElement, { type: T }>

/** A choice group (plan §5.3.2): its options are `option` elements placed separately on the canvas. */
export const groupSchema = v.strictObject({
  id: keySchema,
  label: labelSchema,
  required: v.boolean(),
  mark: v.picklist(MARKS),
})
export type ChoiceGroup = v.InferOutput<typeof groupSchema>

/** The key of the paid / not paid pair in the fill order (plan §5.3.4). */
export const PAID_KEY = 'paid'

/** Paper sides in millimetres (D39): from a small ticket to A4. */
export const PAPER_MIN_MM = 20
export const PAPER_MAX_MM = 400
const paperSideSchema = v.pipe(v.number(), v.finite(), v.minValue(PAPER_MIN_MM, `At least ${PAPER_MIN_MM} mm`), v.maxValue(PAPER_MAX_MM, `At most ${PAPER_MAX_MM} mm`))

/**
 * The printed slip's size (D39; guide → Print): the canvas is pixels for the screen and Telegram;
 * paper is millimetres, kept with each published version so a reprint comes out the same size.
 */
export const paperSchema = v.strictObject({ widthMm: paperSideSchema, heightMm: paperSideSchema })
export type Paper = v.InferOutput<typeof paperSchema>

export const designSchema = v.pipe(
  v.strictObject({
    width: canvasSideSchema,
    height: canvasSideSchema,
    /** Absent: printed at the paper's width (D37). */
    paper: v.optional(paperSchema),
    /** The artwork (plan §5.2, D35) over a colour; `null` only before one is uploaded (tests). */
    background: v.strictObject({ color: colorSchema, imageId: v.nullable(idSchema) }),
    elements: v.pipe(v.array(elementSchema), v.maxLength(MAX_ELEMENTS, `At most ${MAX_ELEMENTS} elements`)),
    groups: v.pipe(v.array(groupSchema), v.maxLength(MAX_GROUPS, `At most ${MAX_GROUPS} choice groups`)),
    /**
     * The order the owner fills the fields in (plan §5.3.4): field element ids, group ids and
     * `paid`. Unknown keys are ignored and missing ones go last (`fillOrderOf`).
     */
    fillOrder: v.pipe(v.array(keySchema), v.maxLength(MAX_ELEMENTS + MAX_GROUPS)),
  }),
  v.check(design => uniqueKeys(design), 'Each element and choice group needs its own id'),
  v.check(design => design.elements.every(element => element.type !== 'option' || design.groups.some(group => group.id === element.group)), 'An option belongs to a choice group that doesn\'t exist'),
  v.check(design => design.elements.every(element => element.type !== 'number' || element.min <= element.max), 'A number field\'s minimum is above its maximum'),
)
export type SlipDesign = v.InferOutput<typeof designSchema>

function uniqueKeys(design: { elements: { id: string }[], groups: { id: string }[] }): boolean {
  const keys = [...design.elements.map(element => element.id), ...design.groups.map(group => group.id)]
  return new Set(keys).size === keys.length && !keys.includes(PAID_KEY)
}

/**
 * The owner's values on an order, by key (plan §5.3.2): a number field's number, a text field's
 * text, `true` for a ticked checkbox, a group's chosen option id. Order No., date, phone, amount and
 * paid are the order's own columns, not values.
 */
export type SlipValues = Record<string, number | string | boolean>

/** The order's own data a slip draws (`orders` columns); `null` where it has none yet. */
export interface SlipOrder {
  number: number | null
  /** The shop's day, `YYYY-MM-DD`. */
  date: string | null
  /** E.164. */
  phone: string | null
  /** Minor units of the shop copy's currency. */
  amount: number | null
  paid: boolean | null
}

/** The copy of the shop's details an order keeps (D33): the amount is drawn in its currency. */
export interface SlipShop {
  name: string
  phone: string | null
  address: string | null
  logoImageId: string | null
  currency: 'KHR' | 'USD'
}

/** Everything a slip is filled with. */
export interface SlipData {
  values: SlipValues
  order: SlipOrder
  shop: SlipShop
}

/** A design of a size with no artwork and no fields (a template's start before its artwork, tests). */
export function blankDesign(width: number, height: number): SlipDesign {
  return { width, height, background: { color: '#ffffff', imageId: null }, elements: [], groups: [], fillOrder: [] }
}
