// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { nextTick, reactive } from 'vue'
import { mount } from '@vue/test-utils'
import { blankDesign } from '#shared/contracts/slip-design'
import type { SlipData, SlipDesign } from '#shared/contracts/slip-design'
import { createElement, createGroup } from '#shared/slip/elements'
import { sampleData } from '#shared/slip/fields'
import { slipSvg } from '#shared/slip/svg'
import { testSlipText } from '#shared/slip/tests/support'
import { SlipSvg } from '../components/slip-svg'

// The studio draws each element as its own piece (D34); together they must be the server's SVG,
// the one resvg turns into the customer's PNG (D31, D32).

const text = testSlipText()
const imageHref = (id: string) => `/api/platform/images/${id}`
const ARTWORK = '0190f2a0-0000-7000-8000-000000000001'

function slip(): SlipDesign {
  const group = createGroup('service', { label: { en: 'Service', km: 'សេវា' } })
  return {
    ...blankDesign(800, 600),
    background: { color: '#fffbeb', imageId: ARTWORK },
    groups: [group],
    elements: [
      createElement('number', { id: 'n', x: 400, y: 200, w: 60, h: 40 }, { border: true }),
      createElement('textField', { id: 'tf', x: 20, y: 30, w: 300, h: 80 }, { maxLength: 200 }),
      createElement('checkbox', { id: 'c', x: 50, y: 300 }),
      createElement('option', { id: 'o', x: 400, y: 340 }, { group: 'service' }),
      createElement('option', { id: 'o2', x: 460, y: 340 }, { group: 'service' }),
      createElement('orderNo', { id: 'no', x: 600, y: 400 }),
      createElement('date', { id: 'd', x: 600, y: 460 }),
      createElement('phone', { id: 'p', x: 20, y: 500 }),
      createElement('amount', { id: 'a', x: 300, y: 500 }),
      createElement('paid', { id: 'pd', x: 600, y: 20 }),
    ],
  }
}

/** The drawn slip's content, without the plain `<g>`s the components hold each piece in, or Vue's placeholders for a field with nothing to draw. */
function drawn(root: Element): string {
  const svg = root.cloneNode(true) as Element
  for (const g of [...svg.querySelectorAll('g')].filter(g => g.attributes.length === 0)) g.replaceWith(...g.childNodes)
  return svg.innerHTML.replace(/<!--.*?-->/g, '')
}

function expected(design: SlipDesign, data: SlipData): string {
  return new DOMParser().parseFromString(slipSvg({ design, data, text, imageHref }), 'image/svg+xml').documentElement.innerHTML
}

/** Each shown element's piece (its `<g transform>`'s markup holder), in layer order. */
const pieces = (root: Element) => [...root.querySelectorAll(':scope > g[transform] > g')]

describe('SlipSvg', () => {
  it('draws exactly the server\'s SVG, one piece per element', async () => {
    const design = slip()
    const data = sampleData(design, { date: '2026-11-17' })
    const wrapper = mount(SlipSvg, { props: { design, data, text } })
    await nextTick()
    expect(drawn(wrapper.element)).toBe(expected(design, data))
    // The second option isn't chosen and has no border: nothing to draw.
    expect(pieces(wrapper.element)).toHaveLength(9)
  })

  it('follows a move, a resize and a new value, drawing again only what changed', async () => {
    const design = reactive(slip())
    const data = reactive(sampleData(design, { date: '2026-11-17' }))
    data.values.tf = 'ហាងបោកអ៊ុត Linda Laundry and more words to wrap'
    const wrapper = mount(SlipSvg, { props: { design, data, text } })
    await nextTick()
    const before = pieces(wrapper.element).map(piece => piece.firstChild)

    design.elements[2]!.x += 40
    design.elements[1]!.w = 200
    data.values.n = 7
    await nextTick()
    await nextTick()

    expect(drawn(wrapper.element)).toBe(expected(design, data))
    const after = pieces(wrapper.element).map(piece => piece.firstChild)
    expect(after[2]).toBe(before[2]) // the moved checkbox: same nodes
    expect(after[4]).toBe(before[4]) // an untouched Order No.: same nodes
    expect(after[1]).not.toBe(before[1]) // the narrower text field: wrapped again
    expect(after[0]).not.toBe(before[0]) // the number's new value
  })
})
