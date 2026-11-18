import type { CreateOrderInput, OrderTemplate } from '#shared/contracts/orders'
import type { SlipDesign } from '#shared/contracts/slip-design'
import type { SlipFill } from '#shared/slip/values'
import { cleanValues } from '#shared/slip/values'

/**
 * The New order form's pure rules (plan §3 step 4, §4): which paper slip it starts on, what the
 * server is sent, and what is kept when the slip changes under the owner. Tested in
 * `tests/order-form.test.ts`.
 */

/**
 * The template a new order starts on (plan §4): the one asked for if the shop can use it, else the
 * shop's default, else the only one; `undefined` when the owner must choose.
 */
export function startingTemplate(templates: readonly OrderTemplate[], wanted?: string | null): OrderTemplate | undefined {
  return templates.find(item => item.templateId === wanted)
    ?? templates.find(item => item.isDefault)
    ?? (templates.length === 1 ? templates[0] : undefined)
}

/** What the owner filled, carried onto another design: only the values it has fields for (plan §4). */
export function carryFill(fill: SlipFill, design: SlipDesign): SlipFill {
  const has = (type: string) => design.elements.some(element => element.type === type)
  return {
    values: cleanValues(design, fill.values),
    phone: has('phone') ? fill.phone : '',
    amount: has('amount') ? fill.amount : null,
    paid: fill.paid,
  }
}

/** The body of `POST /api/shop/orders`: the version filled, never a number, date or shop. */
export function toCreateRequest(fill: SlipFill, template: Pick<OrderTemplate, 'versionId' | 'design'>, extra: { customerId?: string | null, dueDate?: string | null } = {}): CreateOrderInput {
  const { customerId = null, dueDate = null } = extra
  return {
    templateVersionId: template.versionId,
    customerId,
    dueDate,
    values: cleanValues(template.design, fill.values),
    phone: fill.phone.trim(),
    amount: fill.amount,
    paid: fill.paid,
  }
}

/** The server's field errors (`values.<key>`, `phone`, `amount`) by the form's keys, with the server's text. */
export function serverProblems(fieldErrors: Record<string, string[]> | undefined): Record<string, string> {
  const problems: Record<string, string> = {}
  for (const [path, messages] of Object.entries(fieldErrors ?? {})) {
    const key = path.startsWith('values.') ? path.slice('values.'.length) : path
    if (messages[0]) problems[key] = messages[0]
  }
  return problems
}

const PHNOM_PENH_OFFSET_MS = 7 * 60 * 60 * 1000

/** The shop's day at `now` (`2026-11-18`, Phnom Penh, UTC+7 all year): the Date box in the preview. The server sets the saved one. */
export function shopToday(now = new Date()): string {
  return new Date(now.getTime() + PHNOM_PENH_OFFSET_MS).toISOString().slice(0, 10)
}

interface CountRange {
  min: number
  max: number
}

/**
 * A count after a tap on − or + (sheet 01's steppers). An empty box counts from 1 (never shows a
 * 0 first), and − on the lowest count empties the box again: an empty box stays empty on the slip.
 */
export function stepCount(current: number | undefined, direction: 1 | -1, range: CountRange): number | undefined {
  const { min, max } = range
  if (current === undefined || !Number.isFinite(current)) return direction === 1 ? Math.min(max, Math.max(min, 1)) : undefined
  const next = Math.round((current + direction) * 100) / 100
  if (direction === -1 && (next < min || next < 1)) return undefined
  return Math.min(max, Math.max(min, next))
}

/** A typed count: `''` is none; `2,5` reads as `2.5`; anything else is `NaN`, which the slip's check reports. */
export function parseCount(text: string): number | undefined {
  const plain = text.trim().replace(',', '.')
  if (!plain) return undefined
  return /^-?\d+(?:\.\d+)?$/.test(plain) ? Number(plain) : Number.NaN
}
