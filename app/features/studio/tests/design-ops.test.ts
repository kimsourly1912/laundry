import { describe, expect, it } from 'vitest'
import { blankDesign } from '#shared/contracts/slip-design'
import type { SlipDesign } from '#shared/contracts/slip-design'
import { createElement, createGroup } from '#shared/slip/elements'
import { duplicateElements, moveLayers, nudgeElements, placeLayer, removeElements } from '../utils/design-ops'
import { createHistory } from '../utils/history'

function design(...ids: string[]): SlipDesign {
  return { ...blankDesign(800, 500), elements: ids.map(id => createElement('rect', { id })) }
}
const order = (slip: SlipDesign) => slip.elements.map(element => element.id)

describe('moveLayers', () => {
  it('moves one step forward or backward, a block together, and stops at the ends', () => {
    expect(order(moveLayers(design('a', 'b', 'c', 'd'), ['b'], 'forward'))).toEqual(['a', 'c', 'b', 'd'])
    expect(order(moveLayers(design('a', 'b', 'c', 'd'), ['b', 'c'], 'forward'))).toEqual(['a', 'd', 'b', 'c'])
    expect(order(moveLayers(design('a', 'b', 'c', 'd'), ['b', 'c'], 'backward'))).toEqual(['b', 'c', 'a', 'd'])
    expect(order(moveLayers(design('a', 'b'), ['b'], 'forward'))).toEqual(['a', 'b'])
    expect(order(moveLayers(design('a', 'b'), ['a'], 'backward'))).toEqual(['a', 'b'])
  })

  it('brings to the front or sends to the back, keeping the chosen ones\' order', () => {
    expect(order(moveLayers(design('a', 'b', 'c', 'd'), ['c', 'a'], 'front'))).toEqual(['b', 'd', 'a', 'c'])
    expect(order(moveLayers(design('a', 'b', 'c', 'd'), ['d', 'b'], 'back'))).toEqual(['b', 'd', 'a', 'c'])
  })

  it('leaves the design it got alone', () => {
    const before = design('a', 'b')
    moveLayers(before, ['a'], 'front')
    expect(order(before)).toEqual(['a', 'b'])
  })
})

describe('placeLayer', () => {
  it('puts an element at a place counted from the top', () => {
    // Layers shows d, c, b, a.
    expect(order(placeLayer(design('a', 'b', 'c', 'd'), 'a', 0))).toEqual(['b', 'c', 'd', 'a'])
    expect(order(placeLayer(design('a', 'b', 'c', 'd'), 'd', 3))).toEqual(['d', 'a', 'b', 'c'])
    expect(order(placeLayer(design('a', 'b', 'c', 'd'), 'd', 1))).toEqual(['a', 'b', 'd', 'c'])
  })
})

describe('removeElements', () => {
  it('removes elements, a choice group with its last option, and their fill order keys', () => {
    const slip: SlipDesign = {
      ...blankDesign(800, 500),
      elements: [createElement('option', { id: 'o1' }, { group: 'g' }), createElement('option', { id: 'o2' }, { group: 'g' }), createElement('number', { id: 'n' })],
      groups: [createGroup('g')],
      fillOrder: ['n', 'g'],
    }
    const one = removeElements(slip, ['o1', 'n'])
    expect(order(one)).toEqual(['o2'])
    expect(one.groups.map(group => group.id)).toEqual(['g'])
    expect(one.fillOrder).toEqual(['g'])
    expect(removeElements(one, ['o2']).groups).toEqual([])
  })
})

describe('duplicateElements', () => {
  it('copies elements with new ids, moved down and right, on top; never a fixed-meaning field', () => {
    const slip: SlipDesign = { ...blankDesign(800, 500), elements: [createElement('rect', { id: 'r', x: 10, y: 10 }), createElement('orderNo', { id: 'no' }), createElement('rect', { id: 'top' })] }
    const { design: copied, ids } = duplicateElements(slip, ['r', 'no'])
    expect(ids).toHaveLength(1)
    expect(ids[0]).not.toBe('r')
    expect(copied.elements.at(-1)).toMatchObject({ id: ids[0], type: 'rect', x: 30, y: 30 })
    expect(copied.elements).toHaveLength(4)
  })
})

describe('nudgeElements', () => {
  it('moves only the chosen elements', () => {
    const moved = nudgeElements(design('a', 'b'), ['b'], 10, -1)
    expect(moved.elements.map(element => [element.x, element.y])).toEqual([[0, 0], [10, -1]])
  })
})

describe('createHistory', () => {
  it('undoes and redoes snapshots, ignores no change, and forgets redo after a new change', () => {
    const history = createHistory('0')
    expect(history.commit('0')).toBe(false)
    history.commit('1')
    history.commit('2')
    expect(history.undo()).toBe('1')
    expect(history.undo()).toBe('0')
    expect(history.undo()).toBeUndefined()
    expect(history.redo()).toBe('1')
    history.commit('3')
    expect(history.canRedo()).toBe(false)
    expect(history.undo()).toBe('1')
  })

  it('keeps the last `limit` changes', () => {
    const history = createHistory('0', 3)
    for (const snapshot of ['1', '2', '3', '4', '5']) history.commit(snapshot)
    const undone = [history.undo(), history.undo(), history.undo(), history.undo()]
    expect(undone).toEqual(['4', '3', '2', undefined])
  })
})

describe('addElements and the fill order', () => {
  it('centres new elements, keeps several in place to each other, and appends fill keys', async () => {
    const { addElements, placeInFillOrder } = await import('../utils/design-ops')
    const slip: SlipDesign = { ...blankDesign(800, 500), fillOrder: ['a'] }
    const once = addElements(slip, [createElement('rect', { id: 'r', w: 40, h: 40 })])
    // The next one steps 24 px down and right of the middle.
    expect(addElements(once, [createElement('rect', { id: 's', w: 40, h: 40 })]).elements.at(-1)).toMatchObject({ x: 404, y: 254 })
    const added = addElements(slip, [createElement('checkbox', { id: 'o1', x: 0, y: 0, w: 40, h: 40 }), createElement('checkbox', { id: 'o2', x: 60, y: 0, w: 40, h: 40 })], { fillKeys: ['g'] })
    expect(added.elements.map(element => [element.x, element.y])).toEqual([[380, 230], [440, 230]])
    expect(added.fillOrder).toEqual(['a', 'g'])
    expect(placeInFillOrder(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b'])
    expect(placeInFillOrder(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a'])
  })
})
