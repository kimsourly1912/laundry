import { initWasm, Resvg } from '@resvg/resvg-wasm'
import { khmerBold, khmerRegular, resvgWasm } from './receipts.assets.mjs'
import type { ReceiptField, ReceiptImageType } from '#shared/contracts/receipts'
import type { ReceiptTextField, ReceiptValues } from '#shared/receipt-fields'
import { checkMarkPath, checkMarkWidth, fieldText, isChecked, isTextField, RECEIPT_FONT, WORD_GAP } from '#shared/receipt-fields'

/**
 * A receipt as a PNG (D28): the background with the fields drawn on it, by resvg (WebAssembly)
 * with Noto Sans Khmer (regular and bold, OFL, in ./fonts) as its only font. The build bundles
 * the WebAssembly and the fonts (Nitro's `wasm` and `raw:` imports; vitest.config.ts does the same
 * for tests).
 *
 * **Words are laid out here, one `<text>` each.** resvg loses a space that follows a Khmer vowel
 * sign (`ស្ត្រី ក` draws as `ស្ត្រីក`) and misshapes Khmer that follows Latin text in the same
 * run (`A ក្រ B`). Each word alone shapes correctly, so a field's text is split at spaces, each
 * word measured by resvg (its drawn box), and the words placed with a fixed gap. A render costs
 * ~0.1–0.7 s of CPU, with the image's size: Workers Paid.
 */

let ready: Promise<void> | undefined

/** Starts resvg once per Worker instance; a failed start is retried by the next render. */
function loadResvg(): Promise<void> {
  ready ??= initWasm(resvgWasm).catch((error: unknown) => {
    ready = undefined
    throw error
  })
  return ready
}

const FONT_OPTIONS = { fontBuffers: [khmerRegular, khmerBold], defaultFontFamily: RECEIPT_FONT, loadSystemFonts: false }

/** Text as XML character data or an attribute value, without characters XML can't hold. */
export function escapeXml(text: string): string {
  return text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function textElement(word: string, x: number, field: ReceiptTextField): string {
  return `<text x="${x}" y="${field.y}" font-family="${RECEIPT_FONT}" font-size="${field.size}" font-weight="${field.bold ? 700 : 400}" fill="${field.color}">${escapeXml(word)}</text>`
}

interface WordBox {
  /** From the pen position to the left edge of what's drawn (negative: drawn left of it). */
  left: number
  width: number
}

/** A word's drawn box at the field's size and weight, measured by drawing it alone. */
function measureWord(word: string, field: ReceiptTextField): WordBox {
  const margin = field.size * 2
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(word.length * field.size * 1.5 + margin * 2)}" height="${field.size * 4}">${textElement(word, margin, { ...field, y: field.size * 2 })}</svg>`
  const resvg = new Resvg(svg, { font: FONT_OPTIONS })
  try {
    const box = resvg.innerBBox()
    return box ? { left: box.x - margin, width: box.width } : { left: 0, width: 0 }
  }
  finally {
    resvg.free()
  }
}

/** A text field's words, placed left to right from where its alignment puts the first one. */
function layOutText(field: ReceiptTextField, text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const boxes = words.map(word => measureWord(word, field))
  const gap = field.size * WORD_GAP
  const total = boxes.reduce((sum, box) => sum + box.width, 0) + gap * Math.max(0, words.length - 1)
  let pen = field.align === 'start' ? field.x : field.align === 'middle' ? field.x - total / 2 : field.x - total
  return words.map((word, i) => {
    const box = boxes[i]!
    const element = textElement(word, Math.round((pen - box.left) * 10) / 10, field)
    pen += box.width + gap
    return element
  })
}

function fieldElements(field: ReceiptField, values: ReceiptValues): string[] {
  if (isTextField(field)) return layOutText(field, fieldText(field, values))
  if (!isChecked(field, values)) return []
  return [`<path d="${checkMarkPath(field.x, field.y, field.size)}" fill="none" stroke="${field.color}" stroke-width="${checkMarkWidth(field.size)}" stroke-linecap="round" stroke-linejoin="round"/>`]
}

export interface ReceiptImage {
  /** Base64, as stored. */
  image: string
  imageType: ReceiptImageType
  width: number
  height: number
}

/** The receipt as SVG: the background, then each field in its list order. */
export async function receiptSvg(background: ReceiptImage, fields: readonly ReceiptField[], values: ReceiptValues): Promise<string> {
  await loadResvg()
  const { image, imageType, width, height } = background
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<image href="data:${imageType};base64,${image}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/>`,
    ...fields.flatMap(field => fieldElements(field, values)),
    '</svg>',
  ].join('\n')
}

/** The receipt as a PNG, at the background's size. */
export async function renderReceiptPng(background: ReceiptImage, fields: readonly ReceiptField[], values: ReceiptValues): Promise<Uint8Array<ArrayBuffer>> {
  const svg = await receiptSvg(background, fields, values)
  const resvg = new Resvg(svg, { font: FONT_OPTIONS })
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
