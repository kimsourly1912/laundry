// The part of fontkit 3's API the slip builder uses (fontkit ships no types). D32.
declare module 'fontkit' {
  export interface Glyph {
    id: number
    path: { toSVG: () => string }
  }
  export interface GlyphPosition {
    xAdvance: number
    yAdvance: number
    xOffset: number
    yOffset: number
  }
  export interface GlyphRun {
    glyphs: Glyph[]
    positions: GlyphPosition[]
    advanceWidth: number
  }
  export interface Font {
    unitsPerEm: number
    /** Font units above the baseline (positive). */
    ascent: number
    /** Font units below the baseline (negative). */
    descent: number
    layout: (text: string) => GlyphRun
  }
  export function create(buffer: Uint8Array): Font
}
