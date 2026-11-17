// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- fontkit ships no types; this file declares them for every tsconfig project that reaches the builder
/// <reference path="./fontkit.d.ts" />
import { create } from 'fontkit'
import type { Font, GlyphRun } from 'fontkit'

/**
 * Slip text as glyph outlines, never as SVG `<text>` (D32). resvg shapes Khmer wrongly; fontkit 3
 * shapes it as HarfBuzz does (`shared/slip/tests/text.test.ts` compares them). Each line is shaped
 * here and written as one `<path>` per glyph, so the browser and resvg draw the same paths. The
 * studio and the server load the same font files (Noto Sans Khmer, regular and bold).
 */

export interface TextStyle {
  size: number
  bold: boolean
}

export interface SlipFonts {
  regular: Uint8Array
  bold: Uint8Array
}

export interface SlipText {
  /** The line's width when drawn (the sum of its glyphs' advances), in pixels. */
  advance: (text: string, style: TextStyle) => number
  /** The line's glyphs as `<path>`s, the pen starting at (x, baseline). */
  paths: (text: string, style: TextStyle, x: number, baseline: number) => string
  /**
   * From the middle of a line to its baseline, in pixels: a line centred on `y` has its baseline at
   * `y + centreToBaseline(style)`. The middle of the font's ascent and descent, so Khmer's marks
   * above and below the letters stay inside the line.
   */
  centreToBaseline: (style: TextStyle) => number
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/** Shaped runs kept per face and text: a slip draws the same labels again and again. */
const MAX_CACHED_RUNS = 2000

export function createSlipText(fonts: SlipFonts): SlipText {
  const faces: Record<'regular' | 'bold', Font> = { regular: create(fonts.regular), bold: create(fonts.bold) }
  const runs = new Map<string, GlyphRun>()
  const glyphPaths = new Map<string, string>()

  const face = (style: TextStyle) => faces[style.bold ? 'bold' : 'regular']

  function layout(text: string, style: TextStyle): GlyphRun {
    const key = `${style.bold ? 1 : 0}|${text}`
    let run = runs.get(key)
    if (!run) {
      if (runs.size >= MAX_CACHED_RUNS) runs.clear()
      run = face(style).layout(text)
      runs.set(key, run)
    }
    return run
  }

  function advance(text: string, style: TextStyle): number {
    return layout(text, style).advanceWidth * style.size / face(style).unitsPerEm
  }

  function glyphPath(style: TextStyle, glyph: GlyphRun['glyphs'][number]): string {
    const key = `${style.bold ? 1 : 0}|${glyph.id}`
    let d = glyphPaths.get(key)
    if (d === undefined) {
      d = glyph.path.toSVG()
      glyphPaths.set(key, d)
    }
    return d
  }

  function paths(text: string, style: TextStyle, x: number, baseline: number): string {
    const scale = style.size / face(style).unitsPerEm
    const s = round(scale * 10000) / 10000
    const run = layout(text, style)
    let pen = 0
    return run.glyphs.map((glyph, i) => {
      const position = run.positions[i]!
      const gx = x + (pen + position.xOffset) * scale
      const gy = baseline - position.yOffset * scale
      pen += position.xAdvance
      const d = glyphPath(style, glyph)
      // Font units are y-up; SVG is y-down.
      return d ? `<path transform="translate(${round(gx)} ${round(gy)}) scale(${s} ${-s})" d="${d}"/>` : ''
    }).join('')
  }

  function centreToBaseline(style: TextStyle): number {
    const font = face(style)
    return (font.ascent + font.descent) / 2 * style.size / font.unitsPerEm
  }

  return { advance, paths, centreToBaseline }
}
