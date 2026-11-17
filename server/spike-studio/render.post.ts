import { initWasm, Resvg } from '@resvg/resvg-wasm'
import { khmerBold, khmerRegular, resvgWasm } from '#server/features/templates/templates.assets.mjs'
import { slipSvg } from '#shared/spike-studio/slip-svg'
import { createSlipText } from '#shared/spike-studio/slip-text'
import type { SlipDesign, SlipValues } from '#shared/spike-studio/design'

/**
 * SPIKE, dev server only (registered in nuxt.config.ts `$development`): the server's PNG of a design,
 * drawn by the shared SVG builder (text shaped by fontkit, as paths). resvg only rasterises: it gets
 * no fonts. No auth and no validation: it never reaches a build.
 */

let ready: Promise<void> | undefined
let text: ReturnType<typeof createSlipText> | undefined

export default defineEventHandler(async (event) => {
  ready ??= initWasm(resvgWasm)
  await ready
  text ??= createSlipText({ regular: khmerRegular, bold: khmerBold })
  const body = await readBody<{ design: SlipDesign, values: SlipValues, svgOnly?: boolean, scale?: number }>(event)
  const started = performance.now()
  const svg = slipSvg({ design: body.design, values: body.values, text })
  const svgMs = performance.now() - started
  if (body.svgOnly) return svg
  const resvg = new Resvg(svg, { fitTo: { mode: 'zoom', value: body.scale ?? 1 }, font: { loadSystemFonts: false } })
  try {
    const rendered = resvg.render()
    try {
      const png = new Uint8Array(rendered.asPng())
      setResponseHeader(event, 'content-type', 'image/png')
      setResponseHeader(event, 'x-timing', `svg ${Math.round(svgMs)} ms, png ${Math.round(performance.now() - started - svgMs)} ms`)
      return png
    }
    finally {
      rendered.free()
    }
  }
  finally {
    resvg.free()
  }
})
