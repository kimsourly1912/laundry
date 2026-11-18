import { describe, expect, it } from 'vitest'
import { blankDesign } from '#shared/contracts/slip-design'
import type { SlipDesign } from '#shared/contracts/slip-design'
import { createElement, createGroup } from '#shared/slip/elements'
import { duplicateElements, nudgeElements, removeElements } from '../utils/design-ops'
import { createHistory } from '../utils/history'

function design(...ids: string[]): SlipDesign {
  return { ...blankDesign(800, 500), elements: ids.map(id => createElement('number', { id })) }
}
const order = (slip: SlipDesign) => slip.elements.map(element => element.id)

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
    const slip: SlipDesign = { ...blankDesign(800, 500), elements: [createElement('number', { id: 'r', x: 10, y: 10 }), createElement('orderNo', { id: 'no' }), createElement('number', { id: 'top' })] }
    const { design: copied, ids } = duplicateElements(slip, ['r', 'no'])
    expect(ids).toHaveLength(1)
    expect(ids[0]).not.toBe('r')
    expect(copied.elements.at(-1)).toMatchObject({ id: ids[0], type: 'number', x: 30, y: 30 })
    expect(copied.elements).toHaveLength(4)
  })

  it('puts copies where an Alt-drag ended', () => {
    const slip: SlipDesign = { ...blankDesign(800, 500), elements: [createElement('number', { id: 'r', x: 10, y: 10 })] }
    const { design: copied, ids } = duplicateElements(slip, ['r'], { at: new Map([['r', { x: 300, y: 40 }]]) })
    expect(copied.elements.map(element => [element.id, element.x, element.y])).toEqual([['r', 10, 10], [ids[0], 300, 40]])
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
    const once = addElements(slip, [createElement('number', { id: 'r', w: 40, h: 40 })])
    // The next one steps 24 px down and right of the middle.
    expect(addElements(once, [createElement('number', { id: 's', w: 40, h: 40 })]).elements.at(-1)).toMatchObject({ x: 404, y: 254 })
    const added = addElements(slip, [createElement('checkbox', { id: 'o1', x: 0, y: 0, w: 40, h: 40 }), createElement('checkbox', { id: 'o2', x: 60, y: 0, w: 40, h: 40 })], { fillKeys: ['g'] })
    expect(added.elements.map(element => [element.x, element.y])).toEqual([[380, 230], [440, 230]])
    expect(added.fillOrder).toEqual(['a', 'g'])
    expect(placeInFillOrder(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b'])
    expect(placeInFillOrder(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a'])
  })
})

describe('align, spread, copy and paste (S5)', () => {
  const box = (id: string, x: number, y: number, w = 20, h = 10) => createElement('number', { id, x, y, w, h })

  it('aligns on the selection\'s edges and middles', async () => {
    const { alignElements } = await import('../utils/design-ops')
    const slip: SlipDesign = { ...blankDesign(800, 500), elements: [box('a', 10, 10), box('b', 100, 50, 40, 30), box('c', 0, 0)] }
    const at = (next: SlipDesign) => next.elements.map(element => [element.x, element.y])
    expect(at(alignElements(slip, ['a', 'b'], 'left'))).toEqual([[10, 10], [10, 50], [0, 0]])
    expect(at(alignElements(slip, ['a', 'b'], 'right'))).toEqual([[120, 10], [100, 50], [0, 0]])
    expect(at(alignElements(slip, ['a', 'b'], 'center'))).toEqual([[65, 10], [55, 50], [0, 0]])
    expect(at(alignElements(slip, ['a', 'b'], 'bottom'))).toEqual([[10, 70], [100, 50], [0, 0]])
    expect(at(alignElements(slip, ['a', 'b'], 'middle'))).toEqual([[10, 40], [100, 30], [0, 0]])
    expect(alignElements(slip, ['a'], 'left')).toBe(slip)
  })

  it('spreads three or more with equal gaps, keeping the ends', async () => {
    const { spreadElements } = await import('../utils/design-ops')
    const slip: SlipDesign = { ...blankDesign(800, 500), elements: [box('a', 0, 0), box('c', 200, 0), box('b', 30, 0, 40)] }
    expect(spreadElements(slip, ['a', 'b', 'c'], 'across').elements.map(element => element.x)).toEqual([0, 200, 90])
    expect(spreadElements(slip, ['a', 'b'], 'across')).toBe(slip)
  })

  it('pastes copies with new ids, brings missing groups, and never a second fixed field', async () => {
    const { copyElements, pasteElements } = await import('../utils/design-ops')
    const from: SlipDesign = { ...blankDesign(800, 500), elements: [createElement('option', { id: 'o1' }, { group: 'g' }), createElement('orderNo', { id: 'no' }), createElement('number', { id: 'n' })], groups: [createGroup('g')] }
    const clipboard = copyElements(from, ['o1', 'no', 'n'])
    const into: SlipDesign = { ...blankDesign(800, 500), elements: [createElement('orderNo', { id: 'mine' })] }
    const { design: pasted, ids } = pasteElements(into, clipboard)
    expect(pasted.elements.map(element => element.type)).toEqual(['orderNo', 'option', 'number'])
    expect(ids).toHaveLength(2)
    expect(pasted.groups).toHaveLength(1)
    expect(pasted.groups[0]!.id).not.toBe('g')
    expect(pasted.elements[1]).toMatchObject({ group: pasted.groups[0]!.id, x: 20, y: 20 })
    expect(pasted.fillOrder).toEqual([ids[1], pasted.groups[0]!.id])
    // Into the same design: the group exists, so the option joins it.
    expect(pasteElements(from, copyElements(from, ['o1'])).design.elements.at(-1)).toMatchObject({ group: 'g' })
  })
})

describe('reactive designs', () => {
  it('duplicates and copies elements of a reactive design (the editor\'s)', async () => {
    const { reactive } = await import('vue')
    const { copyElements, duplicateElements } = await import('../utils/design-ops')
    const slip = reactive<SlipDesign>({ ...blankDesign(800, 500), elements: [createElement('number', { id: 'a' })] })
    expect(duplicateElements(slip, ['a']).ids).toHaveLength(1)
    expect(copyElements(slip, ['a']).elements).toHaveLength(1)
  })
})
