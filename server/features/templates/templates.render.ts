import { initWasm, Resvg } from '@resvg/resvg-wasm'
import satori, { init as initSatori } from 'satori/standalone'
import type { Font, SatoriOptions } from 'satori/standalone'
import type { PaperDraft, PaperFieldBox } from '#shared/contracts/orders'
import { checkHtml } from '#shared/html-slip/catalog'
import { slipTree } from '#shared/html-slip/build'
import type { SlipData, SlipDesign } from '#shared/contracts/slip-design'
import type { ImageType } from '#shared/contracts/templates'
import { slipSvg } from '#shared/slip/svg'
import { createSlipText } from '#shared/slip/text'
import type { SlipText } from '#shared/slip/text'
import { khmerBold, khmerRegular, resvgWasm, satoriLayout } from './templates.assets.mjs'

/**
 * A slip as the customer's PNG (plan §6.2, D32): the shared SVG builder draws it, text already as
 * glyph paths shaped by fontkit, and resvg (WebAssembly) only rasterises it, with no fonts. The PNG
 * is the canvas's size, pixel for pixel. The build bundles the WebAssembly and the fonts
 * (`templates.assets.mjs`).
 */

let ready: Promise<void> | undefined
let slipText: SlipText | undefined

/** Starts resvg once per Worker instance; a failed start is retried by the next render. */
function loadResvg(): Promise<void> {
  ready ??= initWasm(resvgWasm).catch((error: unknown) => {
    ready = undefined
    throw error
  })
  return ready
}

/** The text shaper on the server's own font files: the same bytes the studio loads. */
export function serverSlipText(): SlipText {
  slipText ??= createSlipText({ regular: khmerRegular, bold: khmerBold })
  return slipText
}

export interface SlipImage {
  type: ImageType
  /** Base64. */
  data: string
}

interface RenderInput {
  design: SlipDesign
  data: SlipData
  /** Every image the design draws, by id; a missing one draws nothing. */
  images: ReadonlyMap<string, SlipImage>
}

/** The slip's SVG as the server builds it (the studio's is the same, but for image URLs). */
export function serverSlipSvg(input: RenderInput): string {
  const { design, data, images } = input
  return slipSvg({
    design,
    data,
    text: serverSlipText(),
    imageHref: (id) => {
      const image = images.get(id)
      return image && `data:${image.type};base64,${image.data}`
    },
  })
}

let satoriReady: Promise<void> | undefined
let htmlSlipFonts: Font[] | undefined

/** Starts Satori's layout engine once per Worker instance (D39); a failed start is retried. */
function loadSatori(): Promise<void> {
  satoriReady ??= initSatori(satoriLayout).catch((error: unknown) => {
    satoriReady = undefined
    throw error
  })
  return satoriReady
}

/** The font's bytes as the ArrayBuffer Satori takes (its own copy). */
function fontBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer
}

/**
 * An HTML slip as SVG (D39): the markup parsed and checked against the catalog, the order's data
 * put in as text, and Satori's layout with the same Noto Sans Khmer (text as paths, shaped like
 * HarfBuzz: checked by the spike and by `templates.html.test.ts`). Markup with problems still draws
 * what could be read; publishing refuses it (`publishProblems`). `images` are the library images its
 * `<img>` tags draw (D41).
 */
export async function htmlSlipSvg(input: RenderInput, onNodeDetected?: SatoriOptions['onNodeDetected']): Promise<string> {
  const { design, data, images } = input
  await loadSatori()
  const { nodes } = checkHtml(design.html ?? '', design)
  // Satori can reuse parsed fonts when given the same array across renders.
  htmlSlipFonts ??= [
    { name: 'Slip', data: fontBuffer(khmerRegular), weight: 400, style: 'normal' },
    { name: 'Slip', data: fontBuffer(khmerBold), weight: 700, style: 'normal' },
  ]
  return satori(slipTree({ nodes, design, data, images, editable: !!onNodeDetected }) as never, {
    width: design.width,
    height: design.height,
    fonts: htmlSlipFonts,
    onNodeDetected,
  })
}

/** HTML artwork and its editable boxes from the same layout pass. */
export async function renderPaperDraft(input: RenderInput): Promise<PaperDraft> {
  const fields: PaperFieldBox[] = []
  const svg = await htmlSlipSvg(input, ({ key, left, top, width, height }) => {
    if (typeof key === 'string' && width > 0 && height > 0) fields.push({ key, left, top, width, height })
  })
  return { svg, fields }
}

/** The slip's SVG, whichever kind it is: the artwork with its fields (D35), or HTML (D39). */
export async function renderSlipSvg(input: RenderInput): Promise<string> {
  return input.design.html === undefined ? serverSlipSvg(input) : htmlSlipSvg(input)
}

/** The slip as a PNG at the canvas's size. */
export async function renderSlipPng(input: RenderInput): Promise<Uint8Array<ArrayBuffer>> {
  const svg = await renderSlipSvg(input)
  await loadResvg()
  const resvg = new Resvg(svg, { font: { loadSystemFonts: false } })
  try {
    const rendered = resvg.render()
    try {
      // A copy that owns a plain ArrayBuffer (Response and FormData need one), not WebAssembly memory.
      return new Uint8Array(rendered.asPng())
    }
    finally {
      rendered.free()
    }
  }
  finally {
    resvg.free()
  }
}
