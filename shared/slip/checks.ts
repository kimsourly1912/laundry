import type { SlipDesign, SlipElement } from '#shared/contracts/slip-design'
import { FIXED_TYPES, isOwnerField } from './fields'

/**
 * What a template needs before it's published (plan §5.8). Errors stop Publish, in the studio and on
 * the server; warnings are shown and the platform may go ahead. Each problem names the element or
 * group it's about, so the studio can select it.
 */

export type PublishError
  = | 'noOrderNo'
    | 'duplicateFixed'
    | 'groupTooSmall'
    | 'missingLabel'

export type PublishWarning
  = | 'offCanvas'
    | 'noAmount'
    | 'noPhone'
    | 'noFields'

export interface Problem<T extends string> {
  code: T
  /** The element or group id it's about, if any. */
  key?: string
}

export interface PublishProblems {
  errors: Problem<PublishError>[]
  warnings: Problem<PublishWarning>[]
}

const hasBothLabels = (label: { en: string, km: string }) => Boolean(label.en.trim() && label.km.trim())

/** Whether any part of the element's box (rotated) is outside the canvas. */
export function isOffCanvas(element: SlipElement, design: Pick<SlipDesign, 'width' | 'height'>): boolean {
  const angle = element.rotation * Math.PI / 180
  const cx = element.x + element.w / 2
  const cy = element.y + element.h / 2
  const halfW = (Math.abs(Math.cos(angle)) * element.w + Math.abs(Math.sin(angle)) * element.h) / 2
  const halfH = (Math.abs(Math.sin(angle)) * element.w + Math.abs(Math.cos(angle)) * element.h) / 2
  const slack = 0.5
  return cx - halfW < -slack || cy - halfH < -slack || cx + halfW > design.width + slack || cy + halfH > design.height + slack
}

const FIELD_LIKE = new Set<SlipElement['type']>(['number', 'textField', 'checkbox', 'option', 'orderNo', 'date', 'phone', 'amount', 'paid'])

export function publishProblems(design: SlipDesign): PublishProblems {
  const errors: Problem<PublishError>[] = []
  const warnings: Problem<PublishWarning>[] = []
  const { elements } = design

  // One of each fixed-meaning field, and one Paid and one Not paid spot.
  for (const type of FIXED_TYPES) {
    const found = elements.filter(element => element.type === type)
    for (const extra of found.slice(1)) errors.push({ code: 'duplicateFixed', key: extra.id })
  }
  for (const value of ['paid', 'unpaid'] as const) {
    const found = elements.filter(element => element.type === 'paid' && element.value === value)
    for (const extra of found.slice(1)) errors.push({ code: 'duplicateFixed', key: extra.id })
  }
  if (!elements.some(element => element.type === 'orderNo')) errors.push({ code: 'noOrderNo' })

  for (const group of design.groups) {
    const options = elements.filter(element => element.type === 'option' && element.group === group.id)
    if (options.length < 2) errors.push({ code: 'groupTooSmall', key: group.id })
    if (!hasBothLabels(group.label)) errors.push({ code: 'missingLabel', key: group.id })
  }

  for (const element of elements) {
    const labelled = isOwnerField(element) || element.type === 'option' || element.type === 'paid'
    if (labelled && 'label' in element && !hasBothLabels(element.label)) errors.push({ code: 'missingLabel', key: element.id })
    if (FIELD_LIKE.has(element.type) && isOffCanvas(element, design)) warnings.push({ code: 'offCanvas', key: element.id })
  }

  if (!elements.some(element => element.type === 'amount')) warnings.push({ code: 'noAmount' })
  if (!elements.some(element => element.type === 'phone')) warnings.push({ code: 'noPhone' })
  if (!elements.some(element => FIELD_LIKE.has(element.type) && element.type !== 'orderNo')) warnings.push({ code: 'noFields' })

  return { errors, warnings }
}

/** English, for the server's 422 and logs; the studio shows its own words for each code. */
export const PUBLISH_ERROR_TEXT: Record<PublishError, string> = {
  noOrderNo: 'Add an Order No. field.',
  duplicateFixed: 'A fixed field is on the slip twice.',
  groupTooSmall: 'A choice group needs at least two options.',
  missingLabel: 'A field needs a label in English and in Khmer.',
}
