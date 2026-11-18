import { Resvg } from '@resvg/resvg-wasm'
import { describe, expect, it } from 'vitest'
import { blankDesign } from '#shared/contracts/slip-design'
import type { SlipData, SlipDesign } from '#shared/contracts/slip-design'
import { createElement } from '#shared/slip/elements'
import { htmlSlipSvg, renderSlipPng, serverSlipText } from '#server/features/templates/templates.render'

// HTML slips drawn by Satori (D39): text as paths in the shop's Khmer font, shaped like HarfBuzz
// (our fontkit text is checked against HarfBuzz, shared/slip/tests/text.test.ts), the order's
// values in place, a PNG for Telegram.

const KHMER = 'កាលបរិច្ឆេទទទួល ស្ថានភាព ៛7,000'

const design = (html: string, width = 900, height = 160): SlipDesign => ({
  ...blankDesign(width, height),
  elements: [createElement('number', { id: 'shirt' }, { label: 'Shirt' })],
  html,
})

const data: SlipData = {
  values: { shirt: 2 },
  order: { number: 2139, date: '2026-11-18', phone: null, amount: 7000, paid: false, qrUrl: 'https://t.me/laundry_bot?start=abc' },
  shop: { name: 'Linda Laundry', phone: null, address: null, logoImageId: null, currency: 'KHR' },
}

/** The rightmost column with ink, in a rendered PNG's pixels. */
function inkRight(svg: string): number {
  const image = new Resvg(svg, { font: { loadSystemFonts: false } }).render()
  const { width, height, pixels } = image
  let right = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4
      if (pixels[at + 3]! > 0 && pixels[at]! < 128) right = Math.max(right, x)
    }
  }
  image.free()
  return right
}

describe('htmlSlipSvg', () => {
  it('draws text as paths, with the order\'s values in place', async () => {
    const svg = await htmlSlipSvg({ design: design('<div class="flex flex-col p-4"><span>No. {{order.number}}</span><span>{{fields.shirt}} shirts · {{order.total}}</span><div>{{order.qrCode}}</div></div>'), data })
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).not.toContain('<text')
    expect(svg).toContain('<path')
    // The QR is an image of the order's link.
    expect(svg).toContain('<image')
  })

  it('shapes Khmer as HarfBuzz does: the same width as the fontkit text the slips already draw', async () => {
    // resvg started by the renderer itself (it starts once per instance).
    await renderSlipPng({ design: design('<div>.</div>', 200, 200), data, images: new Map() })
    const size = 40
    const satori = await htmlSlipSvg({ design: design(`<div class="flex"><span class="text-[40px]">${KHMER}</span></div>`), data })
    const text = serverSlipText()
    const fontkit = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="160"><g fill="#111">${text.paths(KHMER, { size, bold: false }, 0, 80)}</g></svg>`
    const [one, two] = [inkRight(satori), inkRight(fontkit)]
    // Unshaped Khmer (subscripts laid out in a row) would run about a fifth longer.
    expect(Math.abs(one - two) / two).toBeLessThan(0.03)
  })

  it('makes the customer\'s PNG at the canvas\'s size', async () => {
    const png = await renderSlipPng({ design: design('<div class="flex p-4">{{order.number}} {{order.qrCode}}</div>', 600, 300), data, images: new Map() })
    expect([...png.slice(1, 4)].map(byte => String.fromCharCode(byte)).join('')).toBe('PNG')
    const view = new DataView(png.buffer)
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([600, 300])
  })
})
