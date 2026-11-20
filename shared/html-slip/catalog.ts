import type { SlipDesign } from '#shared/contracts/slip-design'
import { isOwnerField } from '#shared/slip/fields'
import type { HtmlNode, HtmlProblem } from './parse'
import { parseHtml, walk } from './parse'

/**
 * What an HTML slip may say (D39; product notes → Proposed v1 import): the app's placeholders and
 * the Tailwind utilities Satori draws. One versioned catalog for the AI prompt, the Studio's
 * checks and the renderer. A placeholder's value is always escaped text; the two blocks are drawn
 * by the app.
 */

export const CATALOG_VERSION = 1

/** Text placeholders, `{{shop.name}}`, with what each is. */
export const TEXT_PLACEHOLDERS = {
  'shop.name': 'The shop\'s name',
  'shop.phone': 'The shop\'s phone',
  'shop.address': 'The shop\'s address',
  'order.number': 'The pickup number (leading zeros kept)',
  'order.date': 'The day the order was received',
  'order.dueDate': 'The promised pickup day, or empty',
  'order.total': 'The amount, formatted in the shop\'s currency',
  'order.paymentStatus': 'Paid or Not paid',
  'order.phone': 'The customer\'s phone, or empty',
  'customer.name': 'The customer\'s name, or empty',
} as const
export type TextPlaceholder = keyof typeof TEXT_PLACEHOLDERS

/** Blocks the app draws in place of the placeholder. */
export const BLOCK_PLACEHOLDERS = {
  'order.qrCode': 'The QR code for the order on Telegram (a sample one before saving)',
} as const
export type BlockPlaceholder = keyof typeof BLOCK_PLACEHOLDERS

/** `{{fields.<id>}}`: an owner field's value (the slip's fields, from the Studio's Fields list). */
export const FIELD_PREFIX = 'fields.'

export const PLACEHOLDER = /\{\{\s*([a-z][\w.-]*)\s*\}\}/gi

/**
 * Utilities by prefix: layout, spacing, size, type, colour, borders. Satori draws these from Tailwind
 * classes (its `tw`). Anything else is reported, so a slip never relies on one it ignores.
 */
const UTILITY = new RegExp(`^-?(?:${[
  'flex', 'inline-flex', 'grid', 'block', 'inline', 'inline-block', 'hidden', 'contents',
  'flex-(?:row|col|wrap|nowrap|1|auto|initial|none)(?:-reverse)?',
  'grow(?:-0)?', 'shrink(?:-0)?', 'basis-[\\w./[\\]%-]+', 'order-[\\w-]+',
  'items-[a-z]+', 'justify-[a-z]+', 'self-[a-z]+', 'content-[a-z]+', 'place-[a-z-]+',
  'gap(?:-[xy])?-[\\w.[\\]-]+', 'grid-(?:cols|rows)-[\\w-]+', 'col-span-[\\w-]+', 'row-span-[\\w-]+',
  '[pm][trblxy]?-[\\w.[\\]-]+', 'space-[xy]-[\\w.-]+',
  '(?:min-|max-)?[wh]-[\\w./[\\]%-]+', 'size-[\\w./[\\]-]+',
  'text-[\\w.[\\]#-]+', 'font-[a-z]+', 'leading-[\\w.[\\]-]+', 'tracking-[\\w.[\\]-]+',
  'uppercase', 'lowercase', 'capitalize', 'normal-case', 'italic', 'not-italic', 'underline', 'line-through', 'no-underline',
  'tabular-nums', 'truncate', 'whitespace-[a-z-]+', 'break-[a-z]+',
  'border(?:-[trblxy])?(?:-[\\w.[\\]#-]+)?', 'border-(?:solid|dashed|dotted|double|none)', 'rounded(?:-[\\w.[\\]-]+)?', 'divide-[\\w-]+',
  'bg-[\\w.[\\]#-]+', 'opacity-[\\d]+', 'overflow-[a-z-]+',
  'relative', 'absolute', '(?:inset|top|right|bottom|left)(?:-[xy])?-[\\w./[\\]%-]+', 'z-[\\w-]+',
].join('|')})$`)

export function isKnownUtility(name: string): boolean {
  return UTILITY.test(name)
}

/** The placeholders a design's fields add: each owner field and choice group. */
export function fieldPlaceholders(design: Pick<SlipDesign, 'elements' | 'groups'>): string[] {
  return [
    ...design.elements.filter(isOwnerField).map(element => `${FIELD_PREFIX}${element.id}`),
    ...design.groups.map(group => `${FIELD_PREFIX}${group.id}`),
  ]
}

export function isKnownPlaceholder(name: string, design: Pick<SlipDesign, 'elements' | 'groups'>): boolean {
  return Object.hasOwn(TEXT_PLACEHOLDERS, name) || Object.hasOwn(BLOCK_PLACEHOLDERS, name) || fieldPlaceholders(design).includes(name)
}

/** Every placeholder the markup uses, by name. */
export function placeholdersIn(nodes: readonly HtmlNode[]): Set<string> {
  const names = new Set<string>()
  for (const node of walk(nodes)) {
    if ('text' in node) for (const match of node.text.matchAll(PLACEHOLDER)) names.add(match[1]!)
  }
  return names
}

/**
 * The markup's problems against the catalog and the design's fields: the parser's, unknown
 * utilities and unknown placeholders, each where it is, with the choices that exist.
 */
export function checkHtml(source: string, design: Pick<SlipDesign, 'elements' | 'groups' | 'htmlPreset'>): { nodes: HtmlNode[], problems: HtmlProblem[] } {
  const { nodes, problems } = parseHtml(source)
  for (const node of walk(nodes)) {
    if ('tag' in node) {
      for (const name of node.classes) {
        if (!isKnownUtility(name)) problems.push({ line: node.line, column: node.column, message: `The class ${name} isn't supported (layout, spacing, size, text, colour, borders only).` })
      }
      if (design.htmlPreset) {
        for (const child of node.children) {
          if (!('text' in child)) continue
          for (const match of child.text.matchAll(PLACEHOLDER)) {
            const name = match[1]!
            if (Object.hasOwn(BLOCK_PLACEHOLDERS, name) && (node.tag !== 'div' || node.children.some(other => other !== child && (!('text' in other) || other.text.trim())) || child.text.trim() !== match[0])) {
              problems.push({ line: child.line, column: child.column, message: `Put {{${name}}} by itself inside a div.` })
            }
          }
        }
      }
      continue
    }
    const unboundText = design.htmlPreset ? node.text.replaceAll(PLACEHOLDER, '') : ''
    if (unboundText.includes('{{') || unboundText.includes('}}')) {
      problems.push({ line: node.line, column: node.column, message: 'Write a binding as {{name}} using a key from the catalog.' })
    }
    for (const match of node.text.matchAll(PLACEHOLDER)) {
      const name = match[1]!
      if (!isKnownPlaceholder(name, design)) {
        const fields = fieldPlaceholders(design)
        problems.push({ line: node.line, column: node.column, message: `{{${name}}} isn't a placeholder. Use ${[...Object.keys(TEXT_PLACEHOLDERS), ...Object.keys(BLOCK_PLACEHOLDERS), ...fields].map(item => `{{${item}}}`).join(', ')}.` })
      }
    }
  }
  return { nodes, problems: problems.sort((one, two) => one.line - two.line || one.column - two.column) }
}
