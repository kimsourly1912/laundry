import type { SlipDesign, SlipValues } from '#shared/contracts/slip-design'
import { PAID_KEY } from '#shared/contracts/slip-design'
import { toE164 } from '#shared/contracts/phone'

/**
 * The owner's values on a slip (plan §5.4, §6.8): what Try it, the owner's order form (step 3) and
 * the server all check the same way. Values are by key (element or group id); the phone, amount and
 * paid are the order's own fields.
 */

export interface SlipFill {
  values: SlipValues
  /** As typed; stored as E.164. */
  phone: string
  /** Minor units of the shop's currency, `null` when empty. */
  amount: number | null
  paid: boolean
}

export type FillProblem
  = | { code: 'required' }
    | { code: 'range', min: number, max: number }
    | { code: 'decimals', decimals: number }
    | { code: 'tooLong', max: number }
    | { code: 'invalidPhone' }
    | { code: 'invalid' }

/** Problems by key (`phone` and `amount` for those fields); empty when the slip can be saved. */
export type FillProblems = Record<string, FillProblem>

export const AMOUNT_MAX = 1_000_000_000

function decimalsOf(value: number): number {
  const text = String(value)
  if (text.includes('e')) return 99
  return text.split('.')[1]?.length ?? 0
}

/**
 * Checks the fill against the design: every value belongs to a field of this design, has its type
 * and is in its range; required fields have a value. Unknown keys are a problem (`invalid`), so a
 * value meant for another template never gets stored.
 */
export function checkFill(design: SlipDesign, fill: SlipFill): FillProblems {
  const problems: FillProblems = {}
  const known = new Set<string>()

  for (const element of design.elements) {
    const value = fill.values[element.id]
    switch (element.type) {
      case 'number': {
        known.add(element.id)
        if (value === undefined) {
          if (element.required) problems[element.id] = { code: 'required' }
        }
        else if (typeof value !== 'number' || !Number.isFinite(value)) problems[element.id] = { code: 'invalid' }
        else if (value < element.min || value > element.max) problems[element.id] = { code: 'range', min: element.min, max: element.max }
        else if (decimalsOf(value) > element.decimals) problems[element.id] = { code: 'decimals', decimals: element.decimals }
        break
      }
      case 'textField': {
        known.add(element.id)
        if (value === undefined || value === '') {
          if (element.required) problems[element.id] = { code: 'required' }
        }
        else if (typeof value !== 'string') problems[element.id] = { code: 'invalid' }
        else if ([...value].length > element.maxLength) problems[element.id] = { code: 'tooLong', max: element.maxLength }
        break
      }
      case 'checkbox': {
        known.add(element.id)
        if (value !== undefined && value !== true) problems[element.id] = { code: 'invalid' }
        else if (element.required && value !== true) problems[element.id] = { code: 'required' }
        break
      }
      case 'phone': {
        const phone = fill.phone.trim()
        if (!phone) {
          if (element.required) problems.phone = { code: 'required' }
        }
        else if (!toE164(phone)) problems.phone = { code: 'invalidPhone' }
        break
      }
      case 'amount': {
        if (fill.amount === null) {
          if (element.required) problems.amount = { code: 'required' }
        }
        else if (!Number.isInteger(fill.amount) || fill.amount < 0 || fill.amount > AMOUNT_MAX) problems.amount = { code: 'invalid' }
        break
      }
    }
  }

  for (const group of design.groups) {
    known.add(group.id)
    const value = fill.values[group.id]
    const options = design.elements.filter(element => element.type === 'option' && element.group === group.id).map(element => element.id)
    if (value === undefined) {
      if (group.required) problems[group.id] = { code: 'required' }
    }
    else if (typeof value !== 'string' || !options.includes(value)) problems[group.id] = { code: 'invalid' }
  }

  // The phone and the amount are the order's own columns: only a slip with that field may set one.
  if (!design.elements.some(element => element.type === 'phone') && fill.phone.trim()) problems.phone = { code: 'invalid' }
  if (!design.elements.some(element => element.type === 'amount') && fill.amount !== null) problems.amount = { code: 'invalid' }

  for (const key of Object.keys(fill.values)) {
    if (!known.has(key) || key === PAID_KEY) problems[key] = { code: 'invalid' }
  }
  return problems
}

/** The values as stored: only this design's keys, without empty text or unticked boxes. */
export function cleanValues(design: SlipDesign, values: SlipValues): SlipValues {
  const keep = new Set([...design.elements.filter(element => ['number', 'textField', 'checkbox'].includes(element.type)).map(element => element.id), ...design.groups.map(group => group.id)])
  return Object.fromEntries(Object.entries(values).filter(([key, value]) => keep.has(key) && value !== '' && value !== false))
}

/** English, for the server's field errors; the app shows its own words for each code. */
export function fillProblemText(problem: FillProblem): string {
  switch (problem.code) {
    case 'required': return 'Required'
    case 'range': return `From ${problem.min} to ${problem.max}`
    case 'decimals': return problem.decimals ? `At most ${problem.decimals} decimal places` : 'A whole number'
    case 'tooLong': return `At most ${problem.max} characters`
    case 'invalidPhone': return 'Not a valid phone number'
    case 'invalid': return 'Not a value of this slip'
  }
}
