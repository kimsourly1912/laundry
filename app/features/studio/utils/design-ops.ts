import type { SlipDesign, SlipElement } from '#shared/contracts/slip-design'
import { newKey } from '#shared/slip/elements'

/**
 * What the studio does to a design (plan §5.1, §5.3, §5.7), as plain functions: each returns a new
 * design and leaves the one it got alone, so a change is one snapshot for undo.
 */

export type LayerMove = 'forward' | 'backward' | 'front' | 'back'

/** Moves the elements up or down the layers (elements are bottom first), keeping their own order. */
export function moveLayers(design: SlipDesign, ids: readonly string[], move: LayerMove): SlipDesign {
  const chosen = new Set(ids)
  const list = [...design.elements]
  if (move === 'front' || move === 'back') {
    const moving = list.filter(element => chosen.has(element.id))
    const staying = list.filter(element => !chosen.has(element.id))
    return { ...design, elements: move === 'front' ? [...staying, ...moving] : [...moving, ...staying] }
  }
  // One step: swap each chosen element with its neighbour, from the side it moves towards, so a
  // block of chosen elements moves together.
  const step = move === 'forward' ? 1 : -1
  const indexes = list.map((element, index) => (chosen.has(element.id) ? index : -1)).filter(index => index >= 0)
  if (step > 0) indexes.reverse()
  for (const index of indexes) {
    const to = index + step
    if (to < 0 || to >= list.length || chosen.has(list[to]!.id)) continue
    ;[list[index], list[to]] = [list[to]!, list[index]!]
  }
  return { ...design, elements: list }
}

/** Puts the element at `index` counted from the top (Layers' order: top first). */
export function placeLayer(design: SlipDesign, id: string, indexFromTop: number): SlipDesign {
  const list = design.elements.filter(element => element.id !== id)
  const element = design.elements.find(item => item.id === id)
  if (!element) return design
  const at = Math.max(0, Math.min(list.length, list.length - indexFromTop))
  list.splice(at, 0, element)
  return { ...design, elements: list }
}

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

/** Fixed-meaning fields can't be duplicated: at most one of each (plan §5.4.3). */
const SINGLE_TYPES = new Set<SlipElement['type']>(['orderNo', 'date', 'phone', 'amount'])

/**
 * Copies of the elements, `offset` px down and right, each above its original's top-most layer,
 * with new ids. Fixed-meaning fields and paid spots are left out (one of each per template).
 * Returns the design and the copies' ids, to select them.
 */
export function duplicateElements(design: SlipDesign, ids: readonly string[], offset = 20): { design: SlipDesign, ids: string[] } {
  const chosen = new Set(ids)
  const copies = design.elements
    .filter(element => chosen.has(element.id) && !SINGLE_TYPES.has(element.type) && element.type !== 'paid')
    .map(element => ({ ...structuredClone(element), id: newKey(), x: element.x + offset, y: element.y + offset, name: element.name }))
  return { design: { ...design, elements: [...design.elements, ...copies] }, ids: copies.map(copy => copy.id) }
}

/** Changes the named elements with `change` (a box, lock, hide, rename…). */
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

// --- Adding (plan §5.3, §5.4) ---

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
 * Fields the owner fills go to the end of the fill order (plan §5.4.5).
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
