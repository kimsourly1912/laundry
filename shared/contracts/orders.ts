import * as v from 'valibot'
import { idSchema, optionalParam, pageQuerySchema } from './common'
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
  status: optionalParam(v.picklist(ORDER_STATUSES)),
  paid: optionalParam(v.pipe(v.picklist(['true', 'false']), v.transform(value => value === 'true'))),
})
export type OrderListQuery = v.InferOutput<typeof orderListQuerySchema>

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
  /** ISO 8601. */
  createdAt: string
}

/**
 * One order (`GET /api/shop/orders/:id`, and the answer to its create): everything its slip is drawn
 * from. The design is the version the order was made on, never a later one, so a reprint is always
 * the slip the customer was given.
 */
export interface OrderDetail extends OrderListItem {
  templateVersionId: string
  templateVersionNumber: number
  templateName: string
  design: SlipDesign
  values: Record<string, number | string | boolean>
  /** The copy of the shop's details the slip draws (D33). */
  shop: SlipShop
  version: number
  paidAt: string | null
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
