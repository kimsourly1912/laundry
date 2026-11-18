import * as v from 'valibot'
import { idSchema, optionalParam, pageQuerySchema, versionSchema } from './common'
import { keySchema, MAX_ELEMENTS, MAX_GROUPS, TEXT_FIELD_MAX } from './slip-design'
import type { SlipDesign, SlipShop } from './slip-design'
import { AMOUNT_MAX } from '#shared/slip/values'

/**
 * The shop's orders (`/api/shop/orders`, plan §3 steps 4–5, §4): a filled slip. The owner fills an
 * attached template's latest version; the server sets the number, the day and the version, and
 * checks every value against that version (plan §6.8).
 */

export const ORDER_STATUSES = ['open', 'picked_up', 'cancelled'] as const
export type OrderStatus = typeof ORDER_STATUSES[number]

/**
 * Where an open order's work is (D39, product notes → order lifecycle): Received, In progress,
 * Ready. Apart from `status`, so the stored statuses and everything that reads them stay as they
 * are; a picked-up or cancelled order keeps the stage it ended in.
 */
export const ORDER_STAGES = ['received', 'in_progress', 'ready'] as const
export type OrderStage = typeof ORDER_STAGES[number]

/** What the app shows and filters by: the stage while open, else the status. */
export const ORDER_STATES = ['received', 'in_progress', 'ready', 'picked_up', 'cancelled'] as const
export type OrderState = typeof ORDER_STATES[number]

export function orderState(order: { status: OrderStatus, stage: OrderStage }): OrderState {
  return order.status === 'open' ? order.stage : order.status
}

/** One value of a slip (`SlipValues`): a number, a text, a ticked box, a chosen option's id. */
const slipValueSchema = v.union([
  v.pipe(v.number(), v.finite()),
  v.pipe(v.string(), v.maxLength(TEXT_FIELD_MAX)),
  v.boolean(),
])

/**
 * `POST /api/shop/orders` with an `Idempotency-Key` header. `templateVersionId` is the version the
 * owner filled: the server accepts it only while it is the latest published version of a template
 * attached to the shop (409 `TEMPLATE_CHANGED` otherwise), so a value is never stored against a
 * version the owner didn't see.
 */
export const createOrderSchema = v.strictObject({
  templateVersionId: idSchema,
  values: v.pipe(
    v.record(keySchema, slipValueSchema),
    v.check(values => Object.keys(values).length <= MAX_ELEMENTS + MAX_GROUPS, 'Too many values'),
  ),
  /** As typed (`012 345 678`); stored as E.164. Empty when the slip has none. */
  phone: v.pipe(v.string(), v.trim(), v.maxLength(30, 'At most 30 characters')),
  /** Minor units of the shop's currency, as the owner typed it; `null` when empty. */
  amount: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(AMOUNT_MAX))),
  paid: v.boolean(),
})
export type CreateOrderInput = v.InferOutput<typeof createOrderSchema>

/**
 * `GET /api/shop/orders?search=&status=&paid=&page=&pageSize=`: newest first. `search` is an order
 * number (`12`, `#12`) or a phone (`012 345 678`), matched exactly (plan §3: "searchable by order
 * number or phone").
 */
export const orderListQuerySchema = v.object({
  ...pageQuerySchema,
  search: optionalParam(v.pipe(v.string(), v.trim(), v.maxLength(30))),
  /** An open order's stage, or `picked_up`, `cancelled`; `open` is every open order. */
  status: optionalParam(v.picklist([...ORDER_STATES, 'open'])),
  paid: optionalParam(v.pipe(v.picklist(['true', 'false']), v.transform(value => value === 'true'))),
})
export type OrderListQuery = v.InferOutput<typeof orderListQuerySchema>

/**
 * `POST …/orders/:id/payment` (with an `Idempotency-Key`), `…/pick-up`, `…/cancel`: the version the
 * owner saw (409 `VERSION_CONFLICT` when the order changed meanwhile).
 */
export const orderActionSchema = v.strictObject({ version: versionSchema })
export type OrderActionInput = v.InferOutput<typeof orderActionSchema>

/** `GET /api/shop/orders/overview`: Overview's counts; they may overlap (ready and unpaid). */
export interface OrderOverview {
  /** The shop's day the counts are for, `YYYY-MM-DD`. */
  today: string
  receivedToday: number
  inProgress: number
  ready: number
  unpaid: number
}

/** An order in a list (Overview's latest orders). */
export interface OrderListItem {
  id: string
  number: number
  /** The shop's day, `YYYY-MM-DD`. */
  date: string
  /** E.164, or `null`. */
  phone: string | null
  /** Minor units of `currency`, or `null` when the slip has no amount. */
  amount: number | null
  currency: SlipShop['currency']
  paid: boolean
  status: OrderStatus
  stage: OrderStage
  /** ISO 8601. */
  createdAt: string
}

/**
 * One order (`GET /api/shop/orders/:id`, and the answer to its create): everything its slip is drawn
 * from. The design is the version the order was made on, never a later one, so a reprint is always
 * the slip the customer was given.
 */
export interface OrderDetail extends OrderListItem {
  /** The template it was made on: Cancel and copy starts the new order on it, at its latest version. */
  templateId: string
  templateVersionId: string
  templateVersionNumber: number
  templateName: string
  design: SlipDesign
  values: Record<string, number | string | boolean>
  /** The copy of the shop's details the slip draws (D33). */
  shop: SlipShop
  version: number
  paidAt: string | null
  /** When it was last marked ready; `null` before. */
  readyAt: string | null
  pickedUpAt: string | null
  cancelledAt: string | null
}

/**
 * A template the owner can fill (`GET /api/shop/templates`): attached to the shop and published,
 * with its latest version, which a new order uses (plan §4).
 */
export interface OrderTemplate {
  templateId: string
  name: string
  /** The shop's default (plan §4). */
  isDefault: boolean
  versionId: string
  versionNumber: number
  design: SlipDesign
}
