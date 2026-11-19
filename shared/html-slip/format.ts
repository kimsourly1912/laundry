/**
 * Formats a slip's markup the one way the Studio writes it: every element's content goes on its own
 * lines below the opening tag, indented two spaces, so each binding and label reads on a line of
 * its own. Only markup that parses cleanly is formatted; anything else is left for the problems
 * list. Text keeps its entities as written; runs of whitespace become one space, as they render.
 */
import { parseHtml } from './parse'

const VOID_TAGS = new Set(['br', 'hr', 'img'])
const INDENT = '  '

interface Element { tag: string, open: string, children: Node[], selfClosing?: boolean }
type Node = Element | { text: string }

/** The opening tag with its attributes, spacing tidied: `<div class="flex gap-2">`. Names keep their case (SVG's `viewBox`). */
function openingTag(tag: string, attributes: string, selfClosing: boolean): string {
  const parts = [...attributes.matchAll(/([^\s=/>]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g)].map(([, name, value]) => {
    if (value === undefined) return ` ${name}`
    const inner = value.replace(/^["']|["']$/g, '').trim().replace(/\s+/g, ' ')
    return ` ${name}="${inner}"`
  })
  return `<${tag}${parts.join('')}${selfClosing ? '/' : ''}>`
}

function print(node: Node, depth: number): string[] {
  const indent = INDENT.repeat(depth)
  if ('text' in node) return [indent + node.text]
  if (VOID_TAGS.has(node.tag.toLowerCase()) || node.selfClosing) return [indent + node.open]
  if (!node.children.length) return [`${indent}${node.open}</${node.tag}>`]
  return [indent + node.open, ...node.children.flatMap(child => print(child, depth + 1)), `${indent}</${node.tag}>`]
}

/** The formatted markup, or `null` when it has problems to fix first. */
export function formatHtml(source: string): string | null {
  if (parseHtml(source).problems.length) return null
  const root: Element = { tag: '', open: '', children: [] }
  const stack = [root]
  let rest = source
  while (rest) {
    if (rest.startsWith('<!--')) {
      const end = rest.indexOf('-->') + 3
      stack.at(-1)!.children.push({ text: rest.slice(0, end).trim() })
      rest = rest.slice(end)
      continue
    }
    const close = /^<\/\s*[a-z][a-z\d]*\s*>/i.exec(rest)
    if (close) {
      stack.pop()
      rest = rest.slice(close[0].length)
      continue
    }
    const open = /^<\s*([a-z][a-z\d]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/i.exec(rest)
    if (open) {
      const tag = open[1]!
      const selfClosing = Boolean(open[3]) && !VOID_TAGS.has(tag.toLowerCase())
      const element: Element = { tag, open: openingTag(tag, open[2]!, selfClosing), children: [], selfClosing }
      stack.at(-1)!.children.push(element)
      if (!VOID_TAGS.has(tag.toLowerCase()) && !open[3]) stack.push(element)
      rest = rest.slice(open[0].length)
      continue
    }
    const end = rest.indexOf('<')
    const raw = end < 0 ? rest : rest.slice(0, end)
    const text = raw.trim().replace(/\s+/g, ' ')
    if (text) stack.at(-1)!.children.push({ text })
    rest = rest.slice(raw.length)
  }
  return root.children.flatMap(node => print(node, 0)).join('\n')
}
