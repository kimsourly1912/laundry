import { renderSVG } from 'uqr'
import type { SlipData, SlipDesign } from '#shared/contracts/slip-design'
import { formatMoney } from '#shared/format'
import { formatPhone } from '#shared/contracts/phone'
import { formatSlipDate, valueText } from '#shared/slip/fields'
import { BLOCK_PLACEHOLDERS, FIELD_PREFIX, PLACEHOLDER } from './catalog'
import { svgDocument } from './parse'
import type { HtmlElement, HtmlNode } from './parse'

/**
 * An HTML slip's tree filled with an order's data, as the element tree Satori draws (D39). Values
 * become text children, never markup, so nothing in an order can change the slip's structure. The
 * QR is the app's own element.
 */

/** Satori's element: `type`, and `props` with `children`, Tailwind classes (`tw`) or a style. */
export interface SatoriNode {
  key?: string
  type: string
  props: { children?: (SatoriNode | string)[] | SatoriNode | string, tw?: string, style?: Record<string, string | number>, src?: string, width?: number, height?: number }
}

/** A placeholder's text for this order; empty when it has none. */
export function placeholderText(name: string, design: SlipDesign, data: SlipData): string {
  const { order, shop, values } = data
  switch (name) {
    case 'shop.name': return shop.name
    case 'shop.phone': return shop.phone ?? ''
    case 'shop.address': return shop.address ?? ''
    case 'order.number': return order.number === null ? '' : String(order.number)
    case 'order.date': return order.date ? formatSlipDate(order.date) : ''
    case 'order.dueDate': return order.dueDate ? formatSlipDate(order.dueDate) : ''
    case 'order.total': return order.amount === null ? '' : formatMoney(order.amount, shop.currency)
    case 'order.paymentStatus': return order.paid === null ? '' : order.paid ? 'Paid' : 'Not paid'
    case 'order.phone': return order.phone ? formatPhone(order.phone) : ''
    case 'customer.name': return order.customerName ?? ''
  }
  if (!name.startsWith(FIELD_PREFIX)) return ''
  const key = name.slice(FIELD_PREFIX.length)
  const group = design.groups.find(item => item.id === key)
  if (group) {
    const chosen = design.elements.find(element => element.id === values[key])
    return chosen && 'label' in chosen ? chosen.label : ''
  }
  const element = design.elements.find(item => item.id === key)
  if (!element) return ''
  // X, not ✓: the slip font has no check-mark glyph, and an X reads as ticked on a paper form.
  if (element.type === 'checkbox') return values[key] === true ? 'X' : ''
  const value = values[key]
  if (design.htmlPreset && element.type === 'number' && element.unit === 'kg' && typeof value === 'number') {
    return `${value.toFixed(element.decimals)} kg`
  }
  return valueText(element, data)
}

/** `{{order.qrCode}}`: the order's QR, or a neutral sample before there is one (Studio, preview). */
function qrCode(data: SlipData): SatoriNode {
  const size = 120
  const url = data.order.qrUrl
  if (url === null) return { type: 'div', props: { style: { width: size, height: size } } }
  if (!url) {
    return { type: 'div', props: { style: { width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed #9ca3af', color: '#6b7280', fontSize: 18 }, children: 'QR' } }
  }
  const svg = renderSVG(url, { border: 2 })
  return { type: 'img', props: { src: `data:image/svg+xml;base64,${btoa(svg)}`, width: size, height: size } }
}

/** A library image's bytes as the render has them (base64). */
export interface SlipImageData {
  type: string
  data: string
}

interface TreeContext {
  design: SlipDesign
  data: SlipData
  images: ReadonlyMap<string, SlipImageData>
  editable: boolean
}

/**
 * `<img>` and `<svg>` (D41): each drawn as an image. Satori reads its own size: one side set keeps the
 * proportions, both set fit it inside. A library image the render wasn't given draws nothing but its
 * box. The inline drawing is written out again from what the parser's allowlist kept.
 */
function picture(node: HtmlElement, images: TreeContext['images']): SatoriNode {
  const tw = node.classes.length ? { tw: node.classes.join(' ') } : {}
  const image = node.image ? images.get(node.image) : undefined
  const src = node.svg
    ? `data:image/svg+xml;base64,${btoa(svgDocument(node.svg))}`
    : image && `data:${image.type};base64,${image.data}`
  if (!src) return { type: 'div', props: { ...tw, style: { display: 'flex' } } }
  return { type: 'img', props: { ...tw, src, style: { objectFit: 'contain' } } }
}

/** The field key used by the owner controls, for each editable binding. */
function editableKey(name: string): string | undefined {
  if (name.startsWith(FIELD_PREFIX)) return name.slice(FIELD_PREFIX.length)
  if (name === 'order.phone') return 'phone'
  if (name === 'order.total') return 'amount'
  if (name === 'order.paymentStatus') return 'paid'
}

/**
 * An empty field in the owner's draft: invisible text about three characters wide, so the field
 * keeps a box to tap. Whitespace would collapse to 0–7px, and `min-width` does nothing inline.
 */
const EMPTY_FIELD: SatoriNode = { type: 'span', props: { style: { color: 'transparent' }, children: '00000' } }

function wholeField(nodes: readonly HtmlNode[]): string | undefined {
  const [node] = nodes
  if (nodes.length !== 1 || !node || !('text' in node)) return
  const match = [...node.text.trim().matchAll(PLACEHOLDER)][0]
  if (match?.[0] === node.text.trim()) return editableKey(match[1]!)
}

function children(nodes: readonly HtmlNode[], context: TreeContext, parentKey?: string): (SatoriNode | string)[] {
  const { design, data, images, editable } = context
  const out: (SatoriNode | string)[] = []
  for (const node of nodes) {
    if ('tag' in node) {
      if (node.tag === 'img' || node.tag === 'svg') out.push(picture(node, images))
      else {
        const key = editable ? wholeField(node.children) : undefined
        out.push({ key, type: node.tag, props: { ...(node.classes.length ? { tw: node.classes.join(' ') } : {}), children: children(node.children, context, key) } })
      }
      continue
    }
    let last = 0
    for (const match of node.text.matchAll(PLACEHOLDER)) {
      if (match.index > last) out.push(node.text.slice(last, match.index))
      const name = match[1]!
      if (name === 'order.qrCode') out.push(qrCode(data))
      else {
        const key = editable ? editableKey(name) : undefined
        const value = placeholderText(name, design, data)
        // Keep empty fields present in the draft layout so their boxes can be tapped. Only the
        // editable draft: the saved slip draws an empty field as nothing.
        if (key && !parentKey) out.push({ key, type: 'span', props: { children: value || EMPTY_FIELD } })
        else out.push(key ? value || EMPTY_FIELD : value)
      }
      last = match.index + match[0].length
    }
    if (last < node.text.length) out.push(node.text.slice(last))
  }
  return out.filter(child => child !== '')
}

interface SlipTreeOptions {
  nodes: readonly HtmlNode[]
  design: SlipDesign
  data: SlipData
  /** The library images the markup draws, by id (`imagesIn`). */
  images?: ReadonlyMap<string, SlipImageData>
  editable?: boolean
}

/** The whole slip: the design's canvas size, the Khmer font, white paper, the markup inside. */
export function slipTree(options: SlipTreeOptions): SatoriNode {
  const { nodes, design, data, images = new Map(), editable = false } = options
  return {
    type: 'div',
    props: {
      style: { width: design.width, height: design.height, display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff', color: '#111827', fontFamily: 'Slip', fontSize: 24 },
      children: children(nodes, { design, data, images, editable }),
    },
  }
}

export { BLOCK_PLACEHOLDERS }
