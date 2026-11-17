import { initWasm, Resvg } from '@resvg/resvg-wasm'
import type { SlipData, SlipDesign } from '#shared/contracts/slip-design'
import type { ImageType } from '#shared/contracts/templates'
import { slipSvg } from '#shared/slip/svg'
import { createSlipText } from '#shared/slip/text'
import type { SlipText } from '#shared/slip/text'
import { khmerBold, khmerRegular, resvgWasm } from './templates.assets.mjs'

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

/** The slip as a PNG at the canvas's size. */
export async function renderSlipPng(input: RenderInput): Promise<Uint8Array<ArrayBuffer>> {
  await loadResvg()
  const resvg = new Resvg(serverSlipSvg(input), { font: { loadSystemFonts: false } })
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
