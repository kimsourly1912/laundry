import type { Align, ElementOf, Mark, SlipData, SlipDesign, SlipElement } from '#shared/contracts/slip-design'
import { isMarked, valueText } from './fields'
import type { SlipText, TextStyle } from './text'

/**
 * One function draws a slip as SVG (plan §6.2, D32): the studio shows it on screen and the server
 * hands it to resvg for the customer's PNG, so what the platform designs is what the customer gets.
 * Text is drawn as glyph paths (`./text`), so the SVG holds no `<text>`.
 *
 * Every element is drawn in its own box: moved to (x, y), rotated about its centre, at its opacity.
 * Values never spill out of their box: a value wider than its box shrinks, down to half its font
 * size, and is clipped after that (plan §5.4.1).
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

/** The thin box "Draw a border" adds (plan §5.4.1). */
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

/** A text element's height for its text at its width: the studio keeps `h` at this (plan §5.6). */
export function textHeight(element: ElementOf<'text'>, slipText: SlipText): number {
  const style = { size: element.size, bold: element.bold }
  return wrapLines(element.text, style, element.w, slipText).length * element.size * element.lineHeight
}

function textSvg(element: ElementOf<'text'>, slipText: SlipText): string {
  const style = { size: element.size, bold: element.bold }
  const step = element.size * element.lineHeight
  const glyphs = wrapLines(element.text, style, element.w, slipText).map((line, index) => {
    const x = alignedX(element.align, slipText.advance(line, style), element.w)
    return slipText.paths(line, style, round(x), round(step * index + step / 2 + slipText.centreToBaseline(style)))
  }).join('')
  return glyphs ? `<g fill="${escapeXml(element.color)}">${glyphs}</g>` : ''
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

// --- Shapes ---

function strokeAttributes(stroke: string | null, width: number, dashed: boolean): string {
  if (!stroke || width <= 0) return ''
  const dash = dashed ? ` stroke-dasharray="${round(width * 3)} ${round(width * 2)}"` : ''
  return ` stroke="${escapeXml(stroke)}" stroke-width="${round(width)}"${dash}`
}

const fillAttribute = (fill: string | null) => `fill="${fill ? escapeXml(fill) : 'none'}"`

/** Borders are drawn inside the box, so the box is what the platform sees and resizes. */
function rectSvg(element: ElementOf<'rect'>): string {
  const inset = element.stroke ? element.strokeWidth / 2 : 0
  const w = Math.max(0, element.w - inset * 2)
  const h = Math.max(0, element.h - inset * 2)
  const radius = Math.min(element.radius, w / 2, h / 2)
  return `<rect x="${round(inset)}" y="${round(inset)}" width="${round(w)}" height="${round(h)}" rx="${round(radius)}" ${fillAttribute(element.fill)}${strokeAttributes(element.stroke, element.strokeWidth, element.dashed)}/>`
}

function ellipseSvg(element: ElementOf<'ellipse'>): string {
  const inset = element.stroke ? element.strokeWidth / 2 : 0
  return `<ellipse cx="${round(element.w / 2)}" cy="${round(element.h / 2)}" rx="${round(Math.max(0, element.w / 2 - inset))}" ry="${round(Math.max(0, element.h / 2 - inset))}" ${fillAttribute(element.fill)}${strokeAttributes(element.stroke, element.strokeWidth, element.dashed)}/>`
}

function triangleSvg(element: ElementOf<'triangle'>): string {
  const inset = element.stroke ? element.strokeWidth : 0
  const points = [[element.w / 2, inset], [element.w - inset, element.h - inset / 2], [inset, element.h - inset / 2]]
  return `<polygon points="${points.map(([x, y]) => `${round(x!)},${round(y!)}`).join(' ')}" stroke-linejoin="round" ${fillAttribute(element.fill)}${strokeAttributes(element.stroke, element.strokeWidth, element.dashed)}/>`
}

function lineSvg(element: ElementOf<'line'>): string {
  const y = round(element.h / 2)
  return `<line x1="0" y1="${y}" x2="${round(element.w)}" y2="${y}"${strokeAttributes(element.color, element.strokeWidth, element.dashed)}/>`
}

/** A square of side `size` centred in the box, as a point maker in its 0–1 coordinates. */
function centredSquare(box: { w: number, h: number }, size: number) {
  return (fx: number, fy: number) => `${round((box.w - size) / 2 + fx * size)} ${round((box.h - size) / 2 + fy * size)}`
}

const STAR_POINTS = Array.from({ length: 10 }, (_, i) => {
  const angle = -Math.PI / 2 + i * Math.PI / 5
  const radius = i % 2 ? 0.2 : 0.5
  return [0.5 + radius * Math.cos(angle), 0.53 + radius * Math.sin(angle)] as const
})

function iconSvg(element: ElementOf<'icon'>): string {
  const size = Math.min(element.w, element.h)
  const at = centredSquare(element, size)
  if (element.icon === 'star') return `<path d="M ${STAR_POINTS.map(([x, y]) => at(x, y)).join(' L ')} Z" fill="${escapeXml(element.color)}"/>`
  return markSvg('tick', element, element.color)
}

/** A checkbox's, option's or paid spot's mark, in the middle of its box (plan §5.4.2). */
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
 * An element's drawing in its own box (0, 0 to w, h), before its position, rotation and opacity
 * (`elementPlacement`). It reads none of those, so a move never redraws it: the studio draws each
 * element as its own piece and redraws only the ones whose drawing changed (D34).
 */
export function elementBodySvg(element: SlipElement, options: SlipSvgOptions): string {
  const { design, data, text, imageHref, idPrefix = '' } = options
  const clipId = `${idPrefix}clip-${element.id}`
  const value = (wrap = false) => 'size' in element && 'align' in element
    ? valueSvg(valueText(element, data), element, element, { wrap, slipText: text, clipId })
    : ''
  switch (element.type) {
    case 'text': return textSvg(element, text)
    case 'rect': return rectSvg(element)
    case 'ellipse': return ellipseSvg(element)
    case 'triangle': return triangleSvg(element)
    case 'line': return lineSvg(element)
    case 'icon': return iconSvg(element)
    case 'image': return imageSvg(imageHref(element.imageId), element, 'none')
    case 'shopInfo':
      if (element.info === 'logo') return imageSvg(data.shop.logoImageId ? imageHref(data.shop.logoImageId) : undefined, element, 'xMidYMid meet')
      return value()
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

/** Where an element's drawing goes: the `transform` and `opacity` of its `<g>` (no opacity at 1). */
export function elementPlacement(element: SlipElement): { transform: string, opacity: string | undefined } {
  const rotate = element.rotation ? ` rotate(${round(element.rotation)} ${round(element.w / 2)} ${round(element.h / 2)})` : ''
  return {
    transform: `translate(${round(element.x)} ${round(element.y)})${rotate}`,
    opacity: element.opacity < 1 ? String(round(element.opacity)) : undefined,
  }
}

function elementSvg(element: SlipElement, options: SlipSvgOptions): string {
  if (element.hidden) return ''
  const body = elementBodySvg(element, options)
  if (!body) return ''
  const { transform, opacity } = elementPlacement(element)
  return `<g transform="${transform}"${opacity === undefined ? '' : ` opacity="${opacity}"`}>${body}</g>`
}

/** The slip's background: its colour, then its image (a photo of the paper slip) when it has one. */
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

/** Every image a design draws (background, images, and the shop's logo when it has a logo element). */
export function imagesOf(design: SlipDesign, shop?: { logoImageId: string | null }): string[] {
  const ids = new Set<string>()
  if (design.background.imageId) ids.add(design.background.imageId)
  for (const element of design.elements) {
    if (element.type === 'image') ids.add(element.imageId)
    if (element.type === 'shopInfo' && element.info === 'logo' && shop?.logoImageId) ids.add(shop.logoImageId)
  }
  return [...ids]
}
