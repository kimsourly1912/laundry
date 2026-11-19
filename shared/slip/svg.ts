import type { Align, ElementOf, Mark, SlipData, SlipDesign, SlipElement } from '#shared/contracts/slip-design'
import { imagesIn, parseHtml } from '#shared/html-slip/parse'
import { isMarked, valueText } from './fields'
import type { SlipText, TextStyle } from './text'

/**
 * One function draws a slip as SVG (plan §6.2, D32, D35): the artwork, then each field's value. The
 * studio shows it on screen and the server hands it to resvg for the customer's PNG, so what the
 * platform sees is what the customer gets. Values are drawn as glyph paths (`./text`), so the SVG
 * holds no `<text>`.
 *
 * Every field is drawn in its own box, moved to (x, y). Values never spill out of their box: a
 * value wider than its box shrinks, down to half its font size, and is clipped after that
 * (plan §5.3.1).
 */

export interface SlipSvgOptions {
  design: SlipDesign
  data: SlipData
  text: SlipText
  /**
   * The `href` for an uploaded image: a `data:` URL on the server; in the studio, any URL the
   * browser has (the canvas is inline SVG). `undefined` draws nothing in its place.
   */
  imageHref: (imageId: string) => string | undefined
  /** Prefixes the SVG's own ids (clip paths), so several slips can share one HTML page. */
  idPrefix?: string
}

/** The thin box "Draw a border" adds (plan §5.3.1). */
export const BORDER_COLOR = '#111827'
export const BORDER_WIDTH = 2
/** Space between a value and its box's sides, in px. */
const VALUE_PADDING = 4
/** A value shrinks down to this share of its font size before it is clipped. */
const MIN_SHRINK = 0.5

export function round(value: number): number {
  return Math.round(value * 100) / 100
}

/** Text as XML character data or an attribute value, without the characters XML can't hold. */
export function escapeXml(text: string): string {
  return text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// --- Text ---

/** Lines of `text` wrapped greedily to `width` at spaces; a new line always starts a line (D32). */
export function wrapLines(text: string, style: TextStyle, width: number, slipText: SlipText): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(/[ \t]+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word
      if (line && slipText.advance(candidate, style) > width) {
        lines.push(line)
        line = word
      }
      else {
        line = candidate
      }
    }
    lines.push(line)
  }
  return lines
}

function alignedX(align: Align, lineWidth: number, boxWidth: number): number {
  if (align === 'left') return 0
  if (align === 'center') return (boxWidth - lineWidth) / 2
  return boxWidth - lineWidth
}

interface ValueStyle {
  size: number
  bold: boolean
  color: string
  align: Align
}

/**
 * A value in its box: one line centred on the box's middle (or lines wrapped at spaces, for a text
 * field), shrunk to fit down to half its size, then clipped.
 */
function valueSvg(text: string, box: { w: number, h: number }, style: ValueStyle, options: { wrap: boolean, slipText: SlipText, clipId: string }): string {
  const { wrap, slipText, clipId } = options
  if (!text.trim()) return ''
  const inner = Math.max(1, box.w - VALUE_PADDING * 2)
  const layout = (size: number) => {
    const textStyle = { size, bold: style.bold }
    const lines = wrap ? wrapLines(text, textStyle, inner, slipText) : [text.replace(/\s*\n\s*/g, ' ')]
    const widest = Math.max(...lines.map(line => slipText.advance(line, textStyle)))
    const height = lines.length * size * 1.4
    return { textStyle, lines, fits: widest <= inner && height <= box.h }
  }
  let size = style.size
  let laidOut = layout(size)
  // Shrink in 5% steps: fast enough for the studio's every frame, close enough for the eye.
  while (!laidOut.fits && size > style.size * MIN_SHRINK) {
    size = Math.max(style.size * MIN_SHRINK, size * 0.95)
    laidOut = layout(size)
  }
  const { textStyle, lines } = laidOut
  const step = size * 1.4
  const top = box.h / 2 - (lines.length * step) / 2
  const glyphs = lines.map((line, index) => {
    const x = VALUE_PADDING + alignedX(style.align, slipText.advance(line, textStyle), inner)
    return slipText.paths(line, textStyle, round(x), round(top + step * index + step / 2 + slipText.centreToBaseline(textStyle)))
  }).join('')
  return `<clipPath id="${clipId}"><rect width="${round(box.w)}" height="${round(box.h)}"/></clipPath><g clip-path="url(#${clipId})" fill="${escapeXml(style.color)}">${glyphs}</g>`
}

/** A square of side `size` centred in the box, as a point maker in its 0–1 coordinates. */
function centredSquare(box: { w: number, h: number }, size: number) {
  return (fx: number, fy: number) => `${round((box.w - size) / 2 + fx * size)} ${round((box.h - size) / 2 + fy * size)}`
}

/** A checkbox's, option's or paid spot's mark, in the middle of its box (plan §5.3.2). */
function markSvg(mark: Mark, box: { w: number, h: number }, color: string): string {
  const size = Math.min(box.w, box.h)
  const at = centredSquare(box, size)
  const stroke = `fill="none" stroke="${escapeXml(color)}" stroke-width="${round(Math.max(2, size * 0.12))}" stroke-linecap="round" stroke-linejoin="round"`
  if (mark === 'tick') return `<path d="M ${at(0.2, 0.55)} L ${at(0.42, 0.76)} L ${at(0.82, 0.26)}" ${stroke}/>`
  if (mark === 'cross') return `<path d="M ${at(0.25, 0.25)} L ${at(0.75, 0.75)} M ${at(0.75, 0.25)} L ${at(0.25, 0.75)}" ${stroke}/>`
  if (mark === 'dot') return `<circle cx="${round(box.w / 2)}" cy="${round(box.h / 2)}" r="${round(size * 0.3)}" fill="${escapeXml(color)}"/>`
  return `<rect x="${round((box.w - size * 0.6) / 2)}" y="${round((box.h - size * 0.6) / 2)}" width="${round(size * 0.6)}" height="${round(size * 0.6)}" fill="${escapeXml(color)}"/>`
}

function borderSvg(element: { w: number, h: number, border: boolean }): string {
  if (!element.border) return ''
  const half = BORDER_WIDTH / 2
  return `<rect x="${half}" y="${half}" width="${round(Math.max(0, element.w - BORDER_WIDTH))}" height="${round(Math.max(0, element.h - BORDER_WIDTH))}" fill="none" stroke="${BORDER_COLOR}" stroke-width="${BORDER_WIDTH}"/>`
}

function imageSvg(href: string | undefined, box: { w: number, h: number }, fit: 'none' | 'xMidYMid meet'): string {
  if (!href) return ''
  return `<image href="${escapeXml(href)}" width="${round(box.w)}" height="${round(box.h)}" preserveAspectRatio="${fit}"/>`
}

// --- Elements ---

function groupMark(design: SlipDesign, element: ElementOf<'option'>): Mark {
  return design.groups.find(group => group.id === element.group)?.mark ?? 'tick'
}

/**
 * A field's drawing in its own box (0, 0 to w, h), before its position (`elementPlacement`). It
 * reads neither x nor y, so a move never redraws it: the studio draws each field as its own piece
 * and redraws only the ones whose drawing changed (D34, D35).
 */
export function elementBodySvg(element: SlipElement, options: SlipSvgOptions): string {
  const { design, data, text, idPrefix = '' } = options
  const clipId = `${idPrefix}clip-${element.id}`
  const value = (wrap = false) => 'size' in element && 'align' in element
    ? valueSvg(valueText(element, data), element, element, { wrap, slipText: text, clipId })
    : ''
  switch (element.type) {
    case 'textField': return borderSvg(element) + value(true)
    case 'number':
    case 'orderNo':
    case 'date':
    case 'phone':
    case 'amount':
      return borderSvg(element) + value()
    case 'checkbox':
    case 'paid':
      return borderSvg(element) + (isMarked(element, data) ? markSvg(element.mark, element, element.color) : '')
    case 'option':
      return borderSvg(element) + (isMarked(element, data) ? markSvg(groupMark(design, element), element, element.color) : '')
  }
}

/** Where a field's drawing goes: the `transform` of its `<g>`. */
export function elementPlacement(element: SlipElement): string {
  return `translate(${round(element.x)} ${round(element.y)})`
}

function elementSvg(element: SlipElement, options: SlipSvgOptions): string {
  const body = elementBodySvg(element, options)
  return body ? `<g transform="${elementPlacement(element)}">${body}</g>` : ''
}

/** The slip's background: its colour, then the artwork (D35) when it has one. */
export function backgroundSvg(design: SlipDesign, imageHref: SlipSvgOptions['imageHref']): string {
  const { width, height, background } = design
  return `<rect width="${width}" height="${height}" fill="${escapeXml(background.color)}"/>`
    + (background.imageId ? imageSvg(imageHref(background.imageId), { w: width, h: height }, 'none') : '')
}

/** The whole slip as an SVG document at the canvas's size: the PNG the customer gets is this size. */
export function slipSvg(options: SlipSvgOptions): string {
  const { design, imageHref } = options
  const { width, height } = design
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    backgroundSvg(design, imageHref),
    ...design.elements.map(element => elementSvg(element, options)),
    '</svg>',
  ].join('')
}

/** The images a design draws: its artwork (D35), and an HTML slip's `<img>` tags (D41). */
export function imagesOf(design: SlipDesign): string[] {
  const artwork = design.background.imageId ? [design.background.imageId] : []
  if (design.html === undefined) return artwork
  return [...new Set([...artwork, ...imagesIn(parseHtml(design.html).nodes)])]
}
