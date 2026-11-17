import type { CheckboxElement, RectElement, SlipDesign, SlipElement, SlipValues, TextElement } from './design'
import type { SlipText } from './slip-text'

/**
 * SPIKE (plan §6.2): one function draws a design as SVG, for the studio's screen and for the server's
 * PNG (resvg), so what the platform designs is what the customer gets.
 *
 * Text is shaped here by `text` (fontkit) and written as glyph outlines (slip-text.ts), so the SVG holds
 * no `<text>`: the browser and resvg draw the same paths. Lines wrap at spaces to the box's width;
 * a newline starts a new line.
 */

export interface SlipSvgOptions {
  design: SlipDesign
  values: SlipValues
  text: SlipText
}

export interface TextLine {
  text: string
  /** Where the pen starts, in the element's own box. */
  x: number
  baseline: number
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

export function escapeXml(text: string): string {
  return text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** The text wrapped greedily to the box's width at spaces, each line aligned in the box. */
export function layOutText(element: TextElement, text: SlipText): TextLine[] {
  const style = { size: element.size, bold: element.bold }
  const lines: string[] = []
  for (const paragraph of element.text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word
      if (line && text.advance(candidate, style) > element.w) {
        lines.push(line)
        line = word
      }
      else {
        line = candidate
      }
    }
    lines.push(line)
  }

  const lineStep = element.size * element.lineHeight
  return lines.map((line, index) => {
    const width = text.advance(line, style)
    const x = element.align === 'start' ? 0 : element.align === 'middle' ? (element.w - width) / 2 : element.w - width
    // The baseline sits at 75% of the line: Khmer stacks marks above and below the base letters.
    return { text: line, x: round(x), baseline: round(lineStep * index + lineStep * 0.75) }
  })
}

function textSvg(element: TextElement, options: SlipSvgOptions): string {
  const style = { size: element.size, bold: element.bold }
  const glyphs = layOutText(element, options.text).map(line => options.text.paths(line.text, style, line.x, line.baseline)).join('')
  return `<g fill="${escapeXml(element.color)}">${glyphs}</g>`
}

function rectSvg(element: RectElement): string {
  const half = element.strokeWidth / 2
  const dash = element.dashed ? ` stroke-dasharray="${element.strokeWidth * 3} ${element.strokeWidth * 2}"` : ''
  const stroke = element.stroke !== 'none' && element.strokeWidth > 0 ? ` stroke="${escapeXml(element.stroke)}" stroke-width="${element.strokeWidth}"${dash}` : ''
  // The border is drawn inside the box, so the box is what the platform sees and resizes.
  return `<rect x="${half}" y="${half}" width="${Math.max(0, element.w - element.strokeWidth)}" height="${Math.max(0, element.h - element.strokeWidth)}" rx="${element.radius}" fill="${escapeXml(element.fill)}"${stroke}/>`
}

function checkboxSvg(element: CheckboxElement, values: SlipValues): string {
  const size = Math.min(element.w, element.h)
  const border = element.border ? `<rect x="1.5" y="1.5" width="${element.w - 3}" height="${element.h - 3}" rx="4" fill="none" stroke="#111827" stroke-width="3"/>` : ''
  if (values[element.id] !== true) return border
  const at = (fx: number, fy: number) => `${round((element.w - size) / 2 + fx * size)} ${round((element.h - size) / 2 + fy * size)}`
  const tick = `<path d="M ${at(0.2, 0.55)} L ${at(0.42, 0.78)} L ${at(0.82, 0.24)}" fill="none" stroke="${escapeXml(element.color)}" stroke-width="${round(Math.max(2, size * 0.12))}" stroke-linecap="round" stroke-linejoin="round"/>`
  return border + tick
}

function elementBody(element: SlipElement, options: SlipSvgOptions): string {
  if (element.type === 'rect') return rectSvg(element)
  if (element.type === 'text') return textSvg(element, options)
  return checkboxSvg(element, options.values)
}

/** One element in its own coordinates: moved to (x, y) and rotated about its centre. */
function elementSvg(element: SlipElement, options: SlipSvgOptions): string {
  if (element.hidden) return ''
  const transform = `translate(${round(element.x)} ${round(element.y)}) rotate(${round(element.rotation)} ${round(element.w / 2)} ${round(element.h / 2)})`
  return `<g data-id="${escapeXml(element.id)}" transform="${transform}" opacity="${element.opacity}">${elementBody(element, options)}</g>`
}

/** The whole slip as an SVG document at the canvas's size. */
export function slipSvg(options: SlipSvgOptions): string {
  const { design } = options
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${design.width}" height="${design.height}" viewBox="0 0 ${design.width} ${design.height}">`,
    `<rect width="${design.width}" height="${design.height}" fill="${escapeXml(design.background)}"/>`,
    ...design.elements.map(element => elementSvg(element, options)),
    '</svg>',
  ].join('')
}
