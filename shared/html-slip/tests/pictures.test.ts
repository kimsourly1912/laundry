import { describe, expect, it } from 'vitest'
import { blankDesign } from '#shared/contracts/slip-design'
import type { SlipData, SlipDesign } from '#shared/contracts/slip-design'
import { imagesOf } from '#shared/slip/svg'
import { imagesIn, parseHtml, svgDocument } from '#shared/html-slip/parse'
import { slipTree } from '#shared/html-slip/build'
import type { SatoriNode } from '#shared/html-slip/build'
import { formatHtml } from '#shared/html-slip/format'

// Library images and inline SVG in an HTML slip (D41): read as data against an allowlist, drawn as
// images, never handed to Satori or a browser as markup.

const ID = '0190f2a0-0000-7000-8000-000000000001'
const design = (html: string): SlipDesign => ({ ...blankDesign(600, 400), html })
const data: SlipData = {
  values: {},
  order: { number: 1, date: '2026-11-19', phone: null, amount: null, paid: null },
  shop: { name: 'Linda Laundry', phone: null, address: null, logoImageId: null, currency: 'KHR' },
}
const messages = (html: string) => parseHtml(html).problems.map(problem => problem.message)
const pictures = (tree: SatoriNode): SatoriNode[] => {
  const children = tree.props.children
  const list = Array.isArray(children) ? children : children === undefined ? [] : [children]
  return list.flatMap(child => typeof child === 'string' ? [] : [...(child.type === 'img' ? [child] : []), ...pictures(child)])
}
const decoded = (src: string) => atob(src.slice('data:image/svg+xml;base64,'.length))

describe('<img> from the library', () => {
  it('takes src="image:<id>" and class, and names the image the slip draws', () => {
    const { nodes, problems } = parseHtml(`<div><img src="image:${ID.toUpperCase()}" class="w-24"></div>`)
    expect(problems).toEqual([])
    expect(imagesIn(nodes)).toEqual([ID])
    expect(imagesOf(design(`<div><img src="image:${ID}"><img src="image:${ID}" class="w-12"></div>`))).toEqual([ID])
  })

  it('refuses any other source or attribute, and an <img> without one', () => {
    expect(messages('<div><img src="https://example.com/logo.png"></div>')[0]).toContain('isn\'t a library image')
    expect(messages('<div><img src="data:image/png;base64,AAAA"></div>')[0]).toContain('isn\'t a library image')
    expect(messages(`<div><img src="image:${ID}" onerror="alert(1)"></div>`)).toEqual(['The attribute onerror isn\'t allowed: only class and src.'])
    expect(messages('<div><img class="w-24"></div>')).toEqual(['<img> needs src="image:<id>": use Insert image.'])
  })

  it('draws the image the render was given, fitted inside its box; a missing one draws only its box', () => {
    const { nodes } = parseHtml(`<div><img src="image:${ID}" class="w-24 h-24"></div>`)
    const drawn = pictures(slipTree({ nodes, design: design(''), data, images: new Map([[ID, { type: 'image/png', data: 'iVBO' }]]) }))
    expect(drawn).toEqual([{ type: 'img', props: { tw: 'w-24 h-24', src: 'data:image/png;base64,iVBO', style: { objectFit: 'contain' } } }])
    expect(pictures(slipTree({ nodes, design: design(''), data }))).toEqual([])
  })
})

describe('inline <svg>', () => {
  const logo = '<svg viewbox="0 0 10 10" class="w-16" xmlns="http://www.w3.org/2000/svg"><defs><lineargradient id="g"><stop offset="0" stop-color="#f00"/></lineargradient></defs><circle cx="5" cy="5" r="4" fill="url(#g)" stroke="#000" stroke-width="1"/></svg>'

  it('keeps the allowlisted drawing, with names as SVG spells them, and draws it as its own image', () => {
    const { nodes, problems } = parseHtml(`<div>${logo}<span>After</span></div>`)
    expect(problems).toEqual([])
    const [picture] = pictures(slipTree({ nodes, design: design(''), data }))
    expect(picture!.props.tw).toBe('w-16')
    expect(decoded(picture!.props.src!)).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient></defs><circle cx="5" cy="5" r="4" fill="url(#g)" stroke="#000" stroke-width="1"/></svg>')
    // The HTML after the drawing is read as HTML again.
    expect(JSON.stringify(nodes)).toContain('"text":"After"')
  })

  it('refuses text, scripts, links, styles and events, dropping what they hold', () => {
    const svg = (inner: string, root = 'viewBox="0 0 10 10"') => `<div><svg ${root}>${inner}</svg></div>`
    expect(messages(svg('<text x="1">Logo</text>'))).toEqual([
      '<text> isn\'t drawn inside an <svg>: write the words in HTML beside it.',
      'Text inside an <svg> isn\'t drawn: write the words in HTML beside it.',
    ])
    expect(messages(svg('<script>alert(1)</script>'))[0]).toContain('<script> isn\'t allowed inside an <svg>')
    expect(messages(svg('<image href="https://example.com/x.png"/>'))[0]).toContain('<image> isn\'t allowed inside an <svg>')
    expect(messages(svg('<use href="#a"/>'))[0]).toContain('<use> isn\'t allowed inside an <svg>')
    expect(messages(svg('<rect width="1" height="1" style="fill:red"/>'))).toEqual(['The attribute style isn\'t allowed inside an <svg> (geometry and colours only).'])
    expect(messages(svg('<rect width="1" height="1" onclick="x()"/>'))).toEqual(['The attribute onclick isn\'t allowed inside an <svg> (geometry and colours only).'])
    expect(messages(svg('<rect width="1" height="1" fill="url(https://example.com/a)"/>'))[0]).toContain('isn\'t a colour')
    expect(messages(svg('<rect width="1" height="1" x="javascript:1"/>'))[0]).toContain('has characters a drawing doesn\'t use')
    expect(messages(svg('<path d="M0 0"/>', 'onload="x()" viewBox="0 0 1 1"'))).toEqual(['The attribute onload isn\'t allowed inside an <svg> (geometry and colours only).'])
    expect(messages(svg('<path d="M0 0"/>', ''))).toEqual(['<svg> needs a viewBox (or a width and a height).'])

    const { nodes } = parseHtml(svg('<g fill="#000"><script><rect width="9" height="9"/></script><rect width="1" height="1"/></g>'))
    const drawing = (nodes[0] as { children: { svg?: Parameters<typeof svgDocument>[0] }[] }).children[0]!.svg!
    expect(svgDocument(drawing)).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g fill="#000"><rect width="1" height="1"/></g></svg>')
  })

  it('reports an <svg> left open, and keeps the rest of the slip', () => {
    expect(messages('<div><svg viewBox="0 0 1 1"><g></svg></div>')).toEqual(['<g> is never closed.'])
    expect(messages('<div><svg viewBox="0 0 1 1"><path d="M0 0"/></div>')).toContain('<svg> is never closed.')
  })

  it('formats the drawing without losing the case SVG needs', () => {
    const formatted = formatHtml(`<div>${logo.replace('viewbox', 'viewBox').replaceAll('lineargradient', 'linearGradient')}</div>`)!
    expect(formatted).toContain('viewBox="0 0 10 10"')
    expect(formatted).toContain('<linearGradient id="g">')
    expect(parseHtml(formatted).problems).toEqual([])
  })
})
