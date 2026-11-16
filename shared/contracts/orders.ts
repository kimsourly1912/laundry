import * as v from 'valibot'
import type { PriceUnit } from './pricing'
import { idSchema, optionalParam, optionalTextSchema, pageQuerySchema, versionSchema } from './common'
import { optionalPhoneSchema } from './phone'

/**
 * A shop's orders (`/api/shop/orders`, spec §7, §8.1, §9, step M2.3). Shared by the server, which
 * decides, and the app, which previews totals and shows only the actions a status allows.
 */

export const ORDER_STATUSES = ['received', 'in_progress', 'ready', 'collected', 'cancelled'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const PAYMENT_STATUSES = ['unpaid', 'paid'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

/**
 * The state machine (spec §7): each action is a `POST /api/shop/orders/:id/<action>` and moves the
 * order from one of `from` to `to`. Any other move is `409 INVALID_STATE`. No `PATCH status`.
 */
export const ORDER_TRANSITIONS = {
  start: { from: ['received'], to: 'in_progress' },
  ready: { from: ['received', 'in_progress'], to: 'ready' },
  rework: { from: ['ready'], to: 'in_progress' },
  collect: { from: ['ready'], to: 'collected' },
  cancel: { from: ['received', 'in_progress', 'ready'], to: 'cancelled' },
} as const satisfies Record<string, { from: readonly OrderStatus[], to: OrderStatus }>

export type OrderAction = keyof typeof ORDER_TRANSITIONS
export const ORDER_ACTIONS = Object.keys(ORDER_TRANSITIONS) as OrderAction[]

/** Whether `action` is allowed from `status`. */
export function canTransition(status: OrderStatus, action: OrderAction): boolean {
  return (ORDER_TRANSITIONS[action].from as readonly OrderStatus[]).includes(status)
}

/** Lines and the note change only before the order is ready (spec P6, §7). */
export const EDITABLE_STATUSES = ['received', 'in_progress'] as const satisfies readonly OrderStatus[]

export function isEditable(status: OrderStatus): boolean {
  return (EDITABLE_STATUSES as readonly OrderStatus[]).includes(status)
}

/** Payment can be recorded at any status but cancelled (spec §7). */
export function canRecordPayment(status: OrderStatus, payment: PaymentStatus): boolean {
  return status !== 'cancelled' && payment === 'unpaid'
}

// --- Lines and totals ---

export const MAX_ORDER_LINES = 50
/** Pieces of one line. */
export const MAX_PIECES = 9_999
/** Grams of one line (1,000 kg). */
export const MAX_GRAMS = 1_000_000
export const ORDER_NOTE_MAX = 500

/**
 * A line's total in minor units (spec T12, T13): pieces × price, or grams × price per kg ÷ 1000
 * rounded to a whole riel or cent (spec §16), half up. The server's answer is the one stored.
 */
export function lineTotal(unit: PriceUnit, quantity: number, unitPrice: number): number {
  return unit === 'piece' ? quantity * unitPrice : Math.round((quantity * unitPrice) / 1000)
}

export function orderTotal(lines: readonly { lineTotal: number }[]): number {
  return lines.reduce((sum, line) => sum + line.lineTotal, 0)
}

/** Pieces, or grams for a per-kg item (`2.5 kg` is `2500`). The upper bound per unit is the server's. */
const quantitySchema = v.pipe(v.number(), v.integer('Must be a whole number'), v.minValue(1, 'Must be at least 1'), v.maxValue(MAX_GRAMS, 'Too large'))

const newLineSchema = v.strictObject({ priceItemId: idSchema, quantity: quantitySchema })
/** A line already on the order: its names and price stay as they were (a snapshot, spec §16). */
const keptLineSchema = v.strictObject({ lineId: idSchema, quantity: quantitySchema })

const linesSchema = <T extends v.GenericSchema>(line: T) => v.pipe(
  v.array(line),
  v.minLength(1, 'Add at least one line'),
  v.maxLength(MAX_ORDER_LINES, `At most ${MAX_ORDER_LINES} lines`),
)

/** The most a customer's name typed at the counter holds (the customers contract's limit). */
export const ORDER_CUSTOMER_NAME_MAX = 100

/**
 * Who the order is for (D27): a customer already chosen (`existing`), or the person at the counter
 * (`counter`): with a phone, the shop's customer with that phone, made now if there is none; with
 * no phone, a walk-in, a customer of their own with only the name given (or none). A name typed
 * for a phone that's already a customer's is ignored: the customer keeps theirs.
 */
export const orderCustomerSchema = v.variant('kind', [
  v.strictObject({ kind: v.literal('existing'), id: idSchema }),
  v.strictObject({
    kind: v.literal('counter'),
    phone: optionalPhoneSchema,
    name: v.pipe(v.string(), v.trim(), v.maxLength(ORDER_CUSTOMER_NAME_MAX, `At most ${ORDER_CUSTOMER_NAME_MAX} characters`)),
  }),
])
export type OrderCustomerInput = v.InferOutput<typeof orderCustomerSchema>

export const createOrderSchema = v.strictObject({
  customer: orderCustomerSchema,
  lines: linesSchema(newLineSchema),
  note: optionalTextSchema(ORDER_NOTE_MAX),
  /** Paid at drop-off: the payment is recorded with the order. */
  paid: v.boolean(),
})
export type CreateOrderInput = v.InferOutput<typeof createOrderSchema>

export const updateOrderSchema = v.strictObject({
  version: versionSchema,
  lines: linesSchema(v.union([keptLineSchema, newLineSchema])),
  note: optionalTextSchema(ORDER_NOTE_MAX),
})
export type UpdateOrderInput = v.InferOutput<typeof updateOrderSchema>
export type UpdateLineInput = UpdateOrderInput['lines'][number]

export const orderActionSchema = v.strictObject({ version: versionSchema })
export type OrderActionInput = v.InferOutput<typeof orderActionSchema>

/** `collect` of an unpaid order needs `allowUnpaid: true`: the app asks the owner first (spec §7). */
export const collectOrderSchema = v.strictObject({ version: versionSchema, allowUnpaid: v.optional(v.boolean(), false) })
export type CollectOrderInput = v.InferOutput<typeof collectOrderSchema>

/** `GET …?status=&payment=&search=&customerId=&page=`: search is an order number, phone digits or a name. */
/**
 * The orders board's tabs (D27): what's waiting to be done (received or, from before D27, in
 * progress), what's ready for pickup, and what's done (collected or cancelled).
 */
export const ORDER_STAGES = {
  waiting: ['received', 'in_progress'],
  ready: ['ready'],
  done: ['collected', 'cancelled'],
} as const satisfies Record<string, readonly OrderStatus[]>
export type OrderStage = keyof typeof ORDER_STAGES
export const ORDER_STAGE_NAMES = Object.keys(ORDER_STAGES) as OrderStage[]

export const orderListQuerySchema = v.object({
  ...pageQuerySchema,
  status: optionalParam(v.picklist(ORDER_STATUSES)),
  /** A board tab: its statuses (with `status`, both apply). */
  stage: optionalParam(v.picklist(ORDER_STAGE_NAMES)),
  payment: optionalParam(v.picklist(PAYMENT_STATUSES)),
  search: optionalParam(v.pipe(v.string(), v.trim(), v.maxLength(100))),
  /** One customer's orders (their history on the customer page). */
  customerId: optionalParam(idSchema),
})
export type OrderListQuery = v.InferOutput<typeof orderListQuerySchema>

// --- Responses ---

export interface OrderCustomer {
  id: string
  /** Empty once anonymized ("Former customer"), or when none was given (a phone, or "Walk-in"). */
  name: string
  phone: string | null
  anonymized: boolean
}

export interface OrderSummary {
  id: string
  number: number
  status: OrderStatus
  paymentStatus: PaymentStatus
  /** Minor units of `currency`. */
  total: number
  currency: 'KHR' | 'USD'
  customer: OrderCustomer
  /** ISO 8601. */
  createdAt: string
  readyAt: string | null
  version: number
}

export interface OrderLine {
  id: string
  /** `null` if the price item is gone; the snapshot below stays. */
  priceItemId: string | null
  serviceNameEn: string
  serviceNameKm: string | null
  itemNameEn: string
  itemNameKm: string | null
  unit: PriceUnit
  /** Pieces, or grams. */
  quantity: number
  unitPrice: number
  lineTotal: number
}

export const ORDER_EVENT_TYPES = ['created', 'updated', 'started', 'ready', 'rework', 'collected', 'cancelled', 'payment_recorded', 'ticket_bound'] as const
export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number]

export interface OrderEvent {
  id: string
  type: OrderEventType
  /** Who did it; `null` if the account no longer has a name. */
  actorName: string | null
  data: Record<string, unknown> | null
  createdAt: string
}

export interface Order extends OrderSummary {
  note: string | null
  lines: OrderLine[]
  /** Newest first. */
  events: OrderEvent[]
  paidAt: string | null
  collectedAt: string | null
  cancelledAt: string | null
}

/** `GET /api/shop/today` (spec §4 → Today). "Today" starts at midnight in Phnom Penh (spec T14). */
export interface TodayOverview {
  counts: {
    received: number
    inProgress: number
    ready: number
    /** Not cancelled and not paid, any status. */
    unpaid: number
    createdToday: number
    collectedToday: number
  }
  /** Ready, not collected: waiting longest first. */
  ready: OrderSummary[]
  /** Unpaid, not cancelled: oldest first. */
  unpaid: OrderSummary[]
}

/** How many orders each list of the Today screen shows. */
export const TODAY_LIST_SIZE = 10
