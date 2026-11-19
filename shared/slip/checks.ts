import type { SlipDesign, SlipElement } from '#shared/contracts/slip-design'
import { FIXED_TYPES, isOwnerField } from './fields'
import { checkHtml, FIELD_PREFIX, placeholdersIn } from '#shared/html-slip/catalog'
import { pricedItem } from '#shared/html-slip/items'

/**
 * What a template needs before it's published (plan §5.6). Errors stop Publish, in the studio and on
 * the server; warnings are shown and the platform may go ahead. Each problem names the element or
 * group it's about, so the studio can select it.
 */

export type PublishError
  = | 'noOrderNo'
    | 'htmlInvalid'
    | 'htmlRenderFailed'
    | 'missingPrintBinding'
    | 'noQrCode'
    | 'duplicateFixed'
    | 'groupTooSmall'
    | 'missingLabel'
    | 'unknownPriceKey'
    | 'priceUnitMismatch'

export type PublishWarning
  = | 'offCanvas'
    | 'noAmount'
    | 'noPhone'
    | 'noFields'
    | 'noPaperSize'

export interface Problem<T extends string> {
  code: T
  /** The element or group id it's about, if any. */
  key?: string
}

export interface PublishProblems {
  errors: Problem<PublishError>[]
  warnings: Problem<PublishWarning>[]
}

const hasLabel = (label: string) => Boolean(label.trim())

/** Whether any part of the field's box is outside the canvas. */
export function isOffCanvas(element: SlipElement, design: Pick<SlipDesign, 'width' | 'height'>): boolean {
  const slack = 0.5
  return element.x < -slack || element.y < -slack || element.x + element.w > design.width + slack || element.y + element.h > design.height + slack
}

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
  if (design.html !== undefined) {
    // D39: an HTML slip draws the number and the QR through its markup, which must pass the catalog.
    const { nodes, problems } = checkHtml(design.html, design)
    if (problems.length) errors.push({ code: 'htmlInvalid' })
    const used = placeholdersIn(nodes)
    if (!used.has('order.number')) errors.push({ code: 'noOrderNo' })
    if (!used.has('order.qrCode')) errors.push({ code: 'noQrCode' })
    for (const element of elements) {
      if ('printRequired' in element && element.printRequired && !used.has(`${FIELD_PREFIX}${element.id}`)) {
        errors.push({ code: 'missingPrintBinding', key: `${FIELD_PREFIX}${element.id}` })
      }
    }
  }
  else if (!elements.some(element => element.type === 'orderNo')) errors.push({ code: 'noOrderNo' })

  for (const group of design.groups) {
    const options = elements.filter(element => element.type === 'option' && element.group === group.id)
    if (options.length < 2) errors.push({ code: 'groupTooSmall', key: group.id })
    if (!hasLabel(group.label)) errors.push({ code: 'missingLabel', key: group.id })
  }

  for (const element of elements) {
    const labelled = isOwnerField(element) || element.type === 'option' || element.type === 'paid'
    if (labelled && 'label' in element && !hasLabel(element.label)) errors.push({ code: 'missingLabel', key: element.id })
    // D43: a price key names an item on the list, counted or weighed as the field is.
    if (element.type === 'number' && element.priceKey) {
      const item = pricedItem(element.priceKey)
      if (!item) errors.push({ code: 'unknownPriceKey', key: element.id })
      else if ((item.kind === 'weight') !== (element.unit === 'kg')) errors.push({ code: 'priceUnitMismatch', key: element.id })
    }
    // An HTML slip doesn't draw the fields' boxes: where they sit doesn't matter.
    if (design.html === undefined && isOffCanvas(element, design)) warnings.push({ code: 'offCanvas', key: element.id })
  }

  if (!elements.some(element => element.type === 'amount')) warnings.push({ code: 'noAmount' })
  if (!elements.some(element => element.type === 'phone')) warnings.push({ code: 'noPhone' })
  if (!elements.some(element => element.type !== 'orderNo')) warnings.push({ code: 'noFields' })
  // D39: printing needs the paper's size; without it, the slip prints at the paper's width.
  if (!design.paper) warnings.push({ code: 'noPaperSize' })

  return { errors, warnings }
}

/** English, for the server's 422 and logs; the studio shows its own words for each code. */
export const PUBLISH_ERROR_TEXT: Record<PublishError, string> = {
  noOrderNo: 'Add an Order No. field.',
  htmlInvalid: 'The slip\'s HTML has problems.',
  htmlRenderFailed: 'The slip could not be rendered with sample order data.',
  missingPrintBinding: 'A required print binding is missing from the HTML.',
  noQrCode: 'Put {{order.qrCode}} in the slip\'s HTML.',
  duplicateFixed: 'A fixed field is on the slip twice.',
  groupTooSmall: 'A choice group needs at least two options.',
  missingLabel: 'A field needs a label.',
  unknownPriceKey: 'A price key isn\'t on the item list.',
  priceUnitMismatch: 'A per-kg item is on a field that isn\'t in kg, or the reverse.',
}
