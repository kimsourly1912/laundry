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
const IMAGE = '0190f2a0-0000-7000-8000-000000000001'

function slip(): SlipDesign {
  const group = createGroup('service', { label: { en: 'Service', km: 'សេវា' } })
  return {
    ...blankDesign(800, 600),
    background: { color: '#fffbeb', imageId: IMAGE },
    groups: [group],
    elements: [
      { ...createElement('text', { id: 't', x: 20, y: 30, w: 300 }, { text: 'ហាងបោកអ៊ុត Linda Laundry and more words to wrap' }), rotation: 12, opacity: 0.5 },
      createElement('rect', { id: 'r', x: 50, y: 300, w: 120, h: 60 }, { stroke: '#111827', dashed: true }),
      createElement('ellipse', { id: 'e', x: 200, y: 300 }),
      createElement('line', { id: 'l', x: 10, y: 500, w: 400 }),
      createElement('icon', { id: 'i', x: 600, y: 20 }, { icon: 'star' }),
      createElement('image', { id: 'img', x: 600, y: 100, w: 100, h: 80 }, { imageId: IMAGE }),
      createElement('number', { id: 'n', x: 400, y: 200, w: 60, h: 40 }, { border: true }),
      createElement('textField', { id: 'tf', x: 400, y: 260, w: 120, h: 60 }),
      createElement('option', { id: 'o', x: 400, y: 340 }, { group: 'service' }),
      createElement('orderNo', { id: 'no', x: 600, y: 400 }),
      { ...createElement('rect', { id: 'hidden' }), hidden: true },
    ],
  }
}

/** The drawn slip's content, without the plain `<g>`s the components hold each piece in. */
function drawn(root: Element): string {
  const svg = root.cloneNode(true) as Element
  for (const g of [...svg.querySelectorAll('g')].filter(g => g.attributes.length === 0)) g.replaceWith(...g.childNodes)
  return svg.innerHTML
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
    expect(pieces(wrapper.element)).toHaveLength(10)
  })

  it('follows a move, a resize and a new value, drawing again only what changed', async () => {
    const design = reactive(slip())
    const data = reactive(sampleData(design, { date: '2026-11-17' }))
    const wrapper = mount(SlipSvg, { props: { design, data, text } })
    await nextTick()
    const before = pieces(wrapper.element).map(piece => piece.firstChild)

    design.elements[1]!.x += 40
    design.elements[0]!.w = 200
    data.values.n = 7
    await nextTick()
    await nextTick()

    expect(drawn(wrapper.element)).toBe(expected(design, data))
    const after = pieces(wrapper.element).map(piece => piece.firstChild)
    expect(after[1]).toBe(before[1]) // the moved rectangle: same nodes
    expect(after[2]).toBe(before[2]) // an untouched ellipse: same nodes
    expect(after[0]).not.toBe(before[0]) // the narrower text: wrapped again
    expect(after[6]).not.toBe(before[6]) // the number's new value
  })

  it('leaves out hidden elements and draws them once shown', async () => {
    const design = reactive(slip())
    const data = sampleData(design, { date: '2026-11-17' })
    const wrapper = mount(SlipSvg, { props: { design, data, text } })
    design.elements[10]!.hidden = false
    await nextTick()
    await nextTick()
    expect(drawn(wrapper.element)).toBe(expected(design, data))
    expect(pieces(wrapper.element)).toHaveLength(11)
  })
})
