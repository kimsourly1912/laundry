import { renderSVG } from 'uqr'
import type { SlipData, SlipDesign, SlipLine } from '#shared/contracts/slip-design'
import { formatMoney } from '#shared/format'
import { formatPhone } from '#shared/contracts/phone'
import { formatSlipDate, valueText } from '#shared/slip/fields'
import { BLOCK_PLACEHOLDERS, FIELD_PREFIX, PLACEHOLDER } from './catalog'
import type { HtmlNode } from './parse'

/**
 * An HTML slip's tree filled with an order's data, as the element tree Satori draws (D39). Values
 * become text children, never markup, so nothing in an order can change the slip's structure. The
 * item lines and the QR are the app's own elements.
 */

/** Satori's element: `type`, and `props` with `children`, Tailwind classes (`tw`) or a style. */
export interface SatoriNode {
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
  if (element.type === 'checkbox') return values[key] === true ? '✓' : ''
  return valueText(element, data)
}

function lineQuantity(line: SlipLine): string {
  return line.unit === 'kg' ? `${(line.quantity / 1000).toFixed(2)} kg` : String(line.quantity)
}

/** `{{order.itemLines}}`: one row per priced line; label, quantity, amount. */
function itemLines(data: SlipData): SatoriNode {
  const lines = data.order.lines ?? []
  return {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column', width: '100%' },
      children: lines.map((line): SatoriNode => ({
        type: 'div',
        props: {
          style: { display: 'flex', flexDirection: 'row', width: '100%' },
          children: [
            { type: 'span', props: { style: { flexGrow: 1 }, children: line.label } },
            { type: 'span', props: { style: { width: '20%', textAlign: 'right' }, children: lineQuantity(line) } },
            { type: 'span', props: { style: { width: '30%', textAlign: 'right' }, children: formatMoney(line.lineTotal, data.shop.currency) } },
          ],
        },
      })),
    },
  }
}

/** `{{order.qrCode}}`: the order's QR, or a neutral sample before there is one (Studio, preview). */
function qrCode(data: SlipData): SatoriNode {
  const size = 120
  const url = data.order.qrUrl
  if (!url) {
    return { type: 'div', props: { style: { width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed #9ca3af', color: '#6b7280', fontSize: 18 }, children: 'QR' } }
  }
  const svg = renderSVG(url, { border: 2 })
  return { type: 'img', props: { src: `data:image/svg+xml;base64,${btoa(svg)}`, width: size, height: size } }
}

function children(nodes: readonly HtmlNode[], design: SlipDesign, data: SlipData): (SatoriNode | string)[] {
  const out: (SatoriNode | string)[] = []
  for (const node of nodes) {
    if ('tag' in node) {
      out.push({ type: node.tag, props: { ...(node.classes.length ? { tw: node.classes.join(' ') } : {}), children: children(node.children, design, data) } })
      continue
    }
    let last = 0
    for (const match of node.text.matchAll(PLACEHOLDER)) {
      if (match.index > last) out.push(node.text.slice(last, match.index))
      const name = match[1]!
      if (name === 'order.itemLines') out.push(itemLines(data))
      else if (name === 'order.qrCode') out.push(qrCode(data))
      else out.push(placeholderText(name, design, data))
      last = match.index + match[0].length
    }
    if (last < node.text.length) out.push(node.text.slice(last))
  }
  // Satori takes no empty strings as children.
  return out.filter(child => child !== '')
}

/** The whole slip: the design's canvas size, the Khmer font, white paper, the markup inside. */
export function slipTree(nodes: readonly HtmlNode[], design: SlipDesign, data: SlipData): SatoriNode {
  return {
    type: 'div',
    props: {
      style: { width: design.width, height: design.height, display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff', color: '#111827', fontFamily: 'Slip', fontSize: 24 },
      children: children(nodes, design, data),
    },
  }
}

export { BLOCK_PLACEHOLDERS }
