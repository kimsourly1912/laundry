import { create } from 'fontkit'
import type { Font } from 'fontkit'

/**
 * SPIKE (plan §6.3, replaced): text drawn as glyph outlines, not as SVG `<text>`.
 *
 * resvg (2.6.2 and 2.7.0-alpha) shapes Khmer wrongly: `សេវា` draws as `សោ`, `ប្រើប្រាស់` loses its
 * vowels. fontkit 3 (pure JavaScript, MIT) shapes it exactly as HarfBuzz and Chrome do, in the browser
 * and in a Worker. So the shared builder shapes every line with fontkit and writes each glyph as a
 * `<path>`: the SVG has no text left for a renderer to get wrong, and the browser and the server
 * draw the same paths.
 */

export interface TextStyle {
  size: number
  bold: boolean
}

export interface SlipText {
  /** The line's width when drawn (the sum of the glyphs' advances), in pixels. */
  advance: (text: string, style: TextStyle) => number
  /** The line's glyphs as `<path>`s, the pen starting at (x, baseline). */
  paths: (text: string, style: TextStyle, x: number, baseline: number) => string
}

export interface SlipFonts {
  regular: Uint8Array
  bold: Uint8Array
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

export function createSlipText(fonts: SlipFonts): SlipText {
  const faces: Record<'regular' | 'bold', Font> = { regular: create(fonts.regular), bold: create(fonts.bold) }
  const runs = new Map<string, ReturnType<Font['layout']>>()

  function layout(text: string, style: TextStyle) {
    const key = `${style.bold ? 1 : 0}|${text}`
    let run = runs.get(key)
    if (!run) {
      run = faces[style.bold ? 'bold' : 'regular'].layout(text)
      runs.set(key, run)
    }
    return run
  }

  function advance(text: string, style: TextStyle): number {
    const face = faces[style.bold ? 'bold' : 'regular']
    return layout(text, style).advanceWidth * style.size / face.unitsPerEm
  }

  function paths(text: string, style: TextStyle, x: number, baseline: number): string {
    const face = faces[style.bold ? 'bold' : 'regular']
    const scale = style.size / face.unitsPerEm
    const run = layout(text, style)
    let pen = 0
    return run.glyphs.map((glyph, i) => {
      const position = run.positions[i]!
      const gx = x + (pen + position.xOffset) * scale
      const gy = baseline - position.yOffset * scale
      pen += position.xAdvance
      const d = glyph.path.toSVG()
      // Font units are y-up; SVG is y-down.
      return d ? `<path transform="translate(${round(gx)} ${round(gy)}) scale(${round(scale * 10000) / 10000} ${-round(scale * 10000) / 10000})" d="${d}"/>` : ''
    }).join('')
  }

  return { advance, paths }
}
