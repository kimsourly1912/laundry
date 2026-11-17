// SPIKE: the part of fontkit 3's API the studio spike uses (fontkit ships no types).
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
    ascent: number
    descent: number
    layout: (text: string) => GlyphRun
  }
  export function create(buffer: Uint8Array): Font
}
