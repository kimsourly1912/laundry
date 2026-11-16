import { Resvg } from '@resvg/resvg-wasm'
import { receiptSvg } from '#server/features/receipts/receipts.render'

/** A plain PNG of `width` × `height`, drawn by resvg (started through the renderer, which owns its start-up). */
export async function pngOf(width: number, height: number): Promise<Uint8Array<ArrayBuffer>> {
  await receiptSvg({ image: '', imageType: 'image/png', width: 1, height: 1 }, [], { text: {} as never, quantities: {}, paid: false, services: [] })
  const resvg = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#fde7ef"/></svg>`)
  const png = new Uint8Array(resvg.render().asPng())
  resvg.free()
  return png
}
