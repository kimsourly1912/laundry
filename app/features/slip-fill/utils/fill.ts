import type { SlipData, SlipDesign, SlipElement, SlipShop } from '#shared/contracts/slip-design'
import { PAID_KEY } from '#shared/contracts/slip-design'
import { toE164 } from '#shared/contracts/phone'
import { fillOrderOf } from '#shared/slip/fields'
import type { SlipFill } from '#shared/slip/values'

/** A fresh slip: nothing filled, not paid. */
export function emptyFill(): SlipFill {
  return { values: {}, phone: '', amount: null, paid: false }
}

/** What the slip draws while it's being filled: the server sets the order number and date on save. */
export function fillData(fill: SlipFill, options: { shop: SlipShop, date: string | null, number?: number | null }): SlipData {
  const { shop, date, number = null } = options
  return {
    values: fill.values,
    order: { number, date, phone: toE164(fill.phone), amount: fill.amount, paid: fill.paid },
    shop,
  }
}

/** One step of the owner's form (plan §5.4.5): a field, a choice group, or Paid / Not paid. */
export type FillStep
  = | { key: string, kind: 'number' | 'textField' | 'checkbox' | 'phone' | 'amount', element: SlipElement }
    | { key: string, kind: 'choice', options: SlipElement[] }
    | { key: string, kind: 'paid' }

/** The steps in the design's fill order. */
export function fillSteps(design: SlipDesign): FillStep[] {
  return fillOrderOf(design).flatMap((key): FillStep[] => {
    if (key === PAID_KEY) return [{ key, kind: 'paid' }]
    const options = design.elements.filter(element => element.type === 'option' && element.group === key)
    if (options.length) return [{ key, kind: 'choice', options }]
    const element = design.elements.find(item => item.id === key)
    if (!element) return []
    if (element.type === 'number' || element.type === 'textField' || element.type === 'checkbox' || element.type === 'phone' || element.type === 'amount') return [{ key, kind: element.type, element }]
    return []
  })
}

/** The key the problems of a step are under (`checkFill`): phone and amount have their own. */
export function problemKey(step: FillStep): string {
  if (step.kind === 'phone' || step.kind === 'amount') return step.kind
  return step.key
}

/** Which step a tap on the slip lands on: the element's own, its group's, or Paid's. */
export function stepOf(steps: FillStep[], element: SlipElement): number {
  const key = element.type === 'option' ? element.group : element.type === 'paid' ? PAID_KEY : element.id
  return steps.findIndex(step => step.key === key)
}
