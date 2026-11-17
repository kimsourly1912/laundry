import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { create } from 'fontkit'
import * as hb from 'harfbuzzjs'
import { describe, expect, it } from 'vitest'
import { createSlipText } from '#shared/slip/text'

// D32: fontkit 3 shapes Khmer exactly as HarfBuzz does (fontkit 2 and resvg don't). This guards an
// upgrade of fontkit, or of the fonts: same glyphs, same positions, on whole mixed lines.

const font = (name: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../../server/features/templates/fonts/${name}`, import.meta.url))))
const fonts = { regular: font('NotoSansKhmer-Regular.ttf'), bold: font('NotoSansKhmer-Bold.ttf') }

const CORPUS = [
  'សេវា',
  'ប្រើប្រាស់',
  'ខោ',
  'ស្ត្រី',
  'ក្រុម',
  'អាវ / Shirt',
  'ហាងបោកអ៊ុត លីនដា Linda Laundry',
  'សូមអរគុណ សម្រាប់ការប្រើប្រាស់សេវាកម្មរបស់យើង',
  'បានបង់ PAID 12,000៛',
  'មិនទាន់បង់',
  'ភួយ ស្បៃមុង ក្រណាត់កន្ទេល',
  'Order No. 1024 · 17/11/2026 · $4.50',
]

function harfBuzz(bytes: Uint8Array, text: string) {
  const face = new hb.Face(new hb.Blob(bytes))
  const hbFont = new hb.Font(face)
  const buffer = new hb.Buffer()
  buffer.addText(text)
  buffer.guessSegmentProperties()
  hb.shape(hbFont, buffer)
  const positions = buffer.getGlyphPositions()
  return buffer.getGlyphInfos().map((glyph, i) => {
    const { xAdvance, yAdvance, xOffset, yOffset } = positions[i]!
    return { id: glyph.codepoint, xAdvance, yAdvance, xOffset, yOffset }
  })
}

function fontkit(bytes: Uint8Array, text: string) {
  const run = create(bytes).layout(text)
  return run.glyphs.map((glyph, i) => {
    const { xAdvance, yAdvance, xOffset, yOffset } = run.positions[i]!
    return { id: glyph.id, xAdvance, yAdvance, xOffset, yOffset }
  })
}

describe('fontkit shapes like HarfBuzz', () => {
  for (const weight of ['regular', 'bold'] as const) {
    it.each(CORPUS)(`${weight}: %s`, (text) => {
      expect(fontkit(fonts[weight], text)).toEqual(harfBuzz(fonts[weight], text))
    })
  }
})

describe('createSlipText', () => {
  const slipText = createSlipText(fonts)

  it('measures a line in pixels, scaled to the font size', () => {
    const at10 = slipText.advance('អាវ Shirt', { size: 10, bold: false })
    expect(at10).toBeGreaterThan(0)
    expect(slipText.advance('អាវ Shirt', { size: 20, bold: false })).toBeCloseTo(at10 * 2, 5)
    expect(slipText.advance('អាវ Shirt', { size: 10, bold: true })).not.toBe(at10)
  })

  it('writes one path per drawn glyph and no text', () => {
    const svg = slipText.paths('Ab', { size: 20, bold: false }, 5, 30)
    expect(svg.match(/<path /g)).toHaveLength(2)
    expect(svg).toMatch(/^<path transform="translate\(5 30\) scale\(0\.02 -0\.02\)" d="M/)
    expect(svg).not.toContain('<text')
    // A space draws nothing.
    expect(slipText.paths(' ', { size: 20, bold: false }, 0, 0)).toBe('')
  })

  it('centres a line on the middle of the font\'s ascent and descent', () => {
    expect(slipText.centreToBaseline({ size: 100, bold: false })).toBeCloseTo((1069 - 293) / 2 / 10, 5)
  })
})
