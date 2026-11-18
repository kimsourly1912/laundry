import type { SlipDesign, SlipElement } from '#shared/contracts/slip-design'
import { newKey } from '#shared/slip/elements'

/** A deep copy through JSON: designs are JSON, and `structuredClone` refuses Vue's reactive proxies. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * What the studio does to a design's fields (plan §5.3–5.5), as plain functions: each returns a new
 * design and leaves the one it got alone, so a change is one snapshot for undo.
 */

/**
 * Removes the elements. An option takes its choice group with it once the group has no options
 * left; the fill order is cleaned by `fillOrderOf` when it's read.
 */
export function removeElements(design: SlipDesign, ids: readonly string[]): SlipDesign {
  const gone = new Set(ids)
  const elements = design.elements.filter(element => !gone.has(element.id))
  const groupsInUse = new Set(elements.flatMap(element => (element.type === 'option' ? [element.group] : [])))
  return {
    ...design,
    elements,
    groups: design.groups.filter(group => groupsInUse.has(group.id)),
    fillOrder: design.fillOrder.filter(key => !gone.has(key)),
  }
}

/** Fixed-meaning fields can't be duplicated: at most one of each (plan §5.3.3). */
const SINGLE_TYPES = new Set<SlipElement['type']>(['orderNo', 'date', 'phone', 'amount'])

/** Whether Duplicate (and an Alt-drag) can copy the element: not a fixed-meaning field or a paid spot. */
export function canDuplicate(element: SlipElement): boolean {
  return !SINGLE_TYPES.has(element.type) && element.type !== 'paid'
}

/**
 * Copies of the elements with new ids, on top: `offset` px down and right, or, for an Alt-drag, at
 * the places in `at` (by the original's id). Fixed-meaning fields and paid spots are left out (one
 * of each per template). Returns the design and the copies' ids, to select them.
 */
export function duplicateElements(design: SlipDesign, ids: readonly string[], options: { offset?: number, at?: ReadonlyMap<string, { x: number, y: number }> } = {}): { design: SlipDesign, ids: string[] } {
  const { offset = 20, at } = options
  const chosen = new Set(ids)
  const copies = design.elements
    .filter(element => chosen.has(element.id) && canDuplicate(element))
    .map(element => ({ ...clone(element), id: newKey(), ...(at?.get(element.id) ?? { x: element.x + offset, y: element.y + offset }) }))
  return { design: { ...design, elements: [...design.elements, ...copies] }, ids: copies.map(copy => copy.id) }
}

/** Changes the named elements with `change` (a box, a setting…). */
export function updateElements(design: SlipDesign, ids: readonly string[], change: (element: SlipElement) => SlipElement): SlipDesign {
  const chosen = new Set(ids)
  return { ...design, elements: design.elements.map(element => (chosen.has(element.id) ? change(element) : element)) }
}

/** Moves the elements by (dx, dy). */
export function nudgeElements(design: SlipDesign, ids: readonly string[], dx: number, dy: number): SlipDesign {
  return updateElements(design, ids, element => ({ ...element, x: element.x + dx, y: element.y + dy }))
}

/** A position or size as stored: one decimal, so a drag doesn't write long fractions. */
export function roundBox(value: number): number {
  return Math.round(value * 10) / 10
}

// --- Adding (plan §5.3) ---

/**
 * A new element's box: centred on the canvas, stepped down and right by how many elements there
 * are (in 8 steps of 24 px), so elements added one after another don't hide each other.
 */
function centred(design: SlipDesign, element: SlipElement): SlipElement {
  const step = (design.elements.length % 8) * 24
  return { ...element, x: roundBox((design.width - element.w) / 2 + step), y: roundBox((design.height - element.h) / 2 + step) }
}

/**
 * Adds elements on top, about the middle of the canvas (several keep their places relative to the first).
 * Fields the owner fills go to the end of the fill order (plan §5.3.4).
 */
export function addElements(design: SlipDesign, elements: SlipElement[], options: { groups?: SlipDesign['groups'], fillKeys?: string[] } = {}): SlipDesign {
  const { groups = [], fillKeys = [] } = options
  const [first] = elements
  if (!first) return design
  const placed = centred(design, first)
  const dx = placed.x - first.x
  const dy = placed.y - first.y
  return {
    ...design,
    elements: [...design.elements, ...elements.map(element => ({ ...element, x: roundBox(element.x + dx), y: roundBox(element.y + dy) }))],
    groups: [...design.groups, ...groups],
    fillOrder: [...design.fillOrder.filter(key => !fillKeys.includes(key)), ...fillKeys],
  }
}

/** Puts a key at `index` of the fill order (dragged in the Form tab), the others keeping their order. */
export function placeInFillOrder(order: readonly string[], key: string, index: number): string[] {
  const rest = order.filter(item => item !== key)
  rest.splice(Math.max(0, Math.min(rest.length, index)), 0, key)
  return rest
}

// --- Several fields (plan §5.4) ---

export type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

/** Lines the elements up on the selection's own edge or middle (their boxes, as stored). */
export function alignElements(design: SlipDesign, ids: readonly string[], alignment: Alignment): SlipDesign {
  const chosen = design.elements.filter(element => ids.includes(element.id))
  if (chosen.length < 2) return design
  const left = Math.min(...chosen.map(element => element.x))
  const right = Math.max(...chosen.map(element => element.x + element.w))
  const top = Math.min(...chosen.map(element => element.y))
  const bottom = Math.max(...chosen.map(element => element.y + element.h))
  return updateElements(design, ids, (element) => {
    switch (alignment) {
      case 'left': return { ...element, x: roundBox(left) }
      case 'center': return { ...element, x: roundBox((left + right) / 2 - element.w / 2) }
      case 'right': return { ...element, x: roundBox(right - element.w) }
      case 'top': return { ...element, y: roundBox(top) }
      case 'middle': return { ...element, y: roundBox((top + bottom) / 2 - element.h / 2) }
      case 'bottom': return { ...element, y: roundBox(bottom - element.h) }
    }
  })
}

/** Spreads three or more elements evenly across or down: the same gap between each, the ends kept. */
export function spreadElements(design: SlipDesign, ids: readonly string[], direction: 'across' | 'down'): SlipDesign {
  const chosen = design.elements.filter(element => ids.includes(element.id))
  if (chosen.length < 3) return design
  const across = direction === 'across'
  const start = (element: SlipElement) => (across ? element.x : element.y)
  const size = (element: SlipElement) => (across ? element.w : element.h)
  const sorted = [...chosen].sort((a, b) => start(a) - start(b))
  const first = sorted[0]!
  const last = sorted.at(-1)!
  const span = start(last) + size(last) - start(first)
  const gap = (span - sorted.reduce((sum, element) => sum + size(element), 0)) / (sorted.length - 1)
  const places = new Map<string, number>()
  let at = start(first)
  for (const element of sorted) {
    places.set(element.id, roundBox(at))
    at += size(element) + gap
  }
  return updateElements(design, ids, element => (across ? { ...element, x: places.get(element.id)! } : { ...element, y: places.get(element.id)! }))
}

// --- Copy and paste (plan §5.5) ---

/** What Copy keeps: the elements and the choice groups their options belong to. */
export interface Clipboard {
  elements: SlipElement[]
  groups: SlipDesign['groups']
}

export function copyElements(design: SlipDesign, ids: readonly string[]): Clipboard {
  const elements = design.elements.filter(element => ids.includes(element.id)).map(element => clone(element))
  const groupIds = new Set(elements.flatMap(element => (element.type === 'option' ? [element.group] : [])))
  return { elements, groups: design.groups.filter(group => groupIds.has(group.id)).map(group => clone(group)) }
}

/**
 * Pastes copies with new ids, `offset` px down and right, on top. Options pasted into a design that
 * doesn't have their group bring a copy of it. Fixed-meaning fields the design already has, and paid
 * spots when it has one, are left out (one of each per template). Returns the pasted ids.
 */
export function pasteElements(design: SlipDesign, clipboard: Clipboard, offset = 20): { design: SlipDesign, ids: string[] } {
  const present = new Set(design.elements.map(element => element.type))
  const groupMap = new Map<string, string>()
  const groups: SlipDesign['groups'] = []
  for (const group of clipboard.groups) {
    if (design.groups.some(item => item.id === group.id)) continue
    const id = newKey()
    groupMap.set(group.id, id)
    groups.push({ ...group, id })
  }
  const elements = clipboard.elements
    .filter(element => !(SINGLE_TYPES.has(element.type) && present.has(element.type)) && !(element.type === 'paid' && present.has('paid')))
    .map((element): SlipElement => {
      const copy = { ...clone(element), id: newKey(), x: roundBox(element.x + offset), y: roundBox(element.y + offset) }
      return copy.type === 'option' ? { ...copy, group: groupMap.get(copy.group) ?? copy.group } : copy
    })
  const fillKeys = [
    ...elements.filter(element => ['number', 'textField', 'checkbox', 'phone', 'amount'].includes(element.type)).map(element => element.id),
    ...groups.map(group => group.id),
  ]
  return {
    design: { ...design, elements: [...design.elements, ...elements], groups: [...design.groups, ...groups], fillOrder: [...design.fillOrder, ...fillKeys] },
    ids: elements.map(element => element.id),
  }
}
