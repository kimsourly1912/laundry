import * as v from 'valibot'
import type { SlipDesign } from '#shared/contracts/slip-design'
import { isOwnerField } from '#shared/slip/fields'
import { BLOCK_PLACEHOLDERS, CATALOG_VERSION, FIELD_PREFIX, TEXT_PLACEHOLDERS } from './catalog'
import { HTML_TAGS } from './parse'

/**
 * The AI import contract, version 1 (D39; product notes → Proposed v1 import): the platform copies a
 * prompt into its own AI with a photo of the shop's slip, and pastes the answer back. The answer is
 * one JSON object; the target shop, paper size, fields and prices stay the Studio's.
 */

export const aiAnswerSchema = v.strictObject({
  version: v.literal(CATALOG_VERSION, 'version must be 1'),
  name: v.pipe(v.string(), v.trim(), v.minLength(1, 'name is required'), v.maxLength(80, 'name: at most 80 characters')),
  html: v.pipe(v.string(), v.minLength(1, 'html is required')),
  reviewNotes: v.optional(v.pipe(v.array(v.pipe(v.string(), v.maxLength(500))), v.maxLength(20))),
})
export type AiAnswer = v.InferOutput<typeof aiAnswerSchema>

export interface AnswerProblem {
  /** Where: `line 3, column 7` of the pasted text, or a key such as `version`. */
  where: string
  message: string
}

/**
 * Where JSON text first goes wrong, as an index: a small scanner of JSON's grammar, since engines
 * word (or leave out) the position in their own errors differently. `undefined` when it's valid.
 */
export function jsonErrorAt(text: string): number | undefined {
  let at = 0
  const space = () => {
    while (at < text.length && ' \t\n\r'.includes(text[at]!)) at++
  }
  function value(): boolean {
    space()
    const char = text[at]
    if (char === '{') return container('}', true)
    if (char === '[') return container(']', false)
    if (char === '"') return string()
    const literal = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(at))
    if (!literal) return false
    at += literal[0].length
    return true
  }
  function string(): boolean {
    // A quote, then characters (no control characters), escapes, and a closing quote.
    let next = at + 1
    while (next < text.length) {
      const char = text[next]!
      if (char === '"') {
        at = next + 1
        return true
      }
      if (char.charCodeAt(0) < 0x20) return false
      if (char === '\\') {
        const escaped = text[next + 1] ?? ''
        if ('"\\/bfnrt'.includes(escaped) && escaped) next += 2
        else if (escaped === 'u' && /^[\da-f]{4}$/i.test(text.slice(next + 2, next + 6))) next += 6
        else return false
        continue
      }
      next++
    }
    return false
  }
  function container(close: string, keyed: boolean): boolean {
    at++
    space()
    if (text[at] === close) {
      at++
      return true
    }
    while (true) {
      if (keyed) {
        space()
        if (text[at] !== '"' || !string()) return false
        space()
        if (text[at] !== ':') return false
        at++
      }
      if (!value()) return false
      space()
      if (text[at] === ',') {
        at++
        continue
      }
      if (text[at] !== close) return false
      at++
      return true
    }
  }
  if (!value()) return at
  space()
  return at < text.length ? at : undefined
}

/** Where `position` is in `text`, as a line and column. */
function lineColumn(text: string, position: number): string {
  const before = text.slice(0, position).split('\n')
  return `line ${before.length}, column ${before.at(-1)!.length + 1}`
}

/**
 * Reads a pasted answer: the JSON object (a ```json fence around it is fine), checked against the
 * contract. Problems say where (a line and column, or a key) and what to fix.
 */
export function readAiAnswer(pasted: string): { answer: AiAnswer } | { problems: AnswerProblem[] } {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(pasted)
  const text = (fenced ? fenced[1]! : pasted).trim()
  let raw: unknown
  try {
    raw = JSON.parse(text)
  }
  catch {
    const position = jsonErrorAt(text)
    return { problems: [{ where: position === undefined ? 'the answer' : lineColumn(text, position), message: 'This is not valid JSON. Paste only the JSON object.' }] }
  }
  const result = v.safeParse(aiAnswerSchema, raw)
  if (result.success) return { answer: result.output }
  return {
    problems: result.issues.map(issue => ({
      where: v.getDotPath(issue) ?? 'the answer',
      message: issue.kind === 'schema' && issue.expected === 'never' ? 'Unknown key: only version, name, html and reviewNotes.' : issue.message,
    })),
  }
}

interface PromptOptions {
  design: Pick<SlipDesign, 'width' | 'height' | 'elements' | 'groups' | 'paper' | 'htmlPreset'>
  /** The design brief: what the shop wants (Keep the layout / Redesign it, and notes). */
  brief: string
}

/** The prompt the platform copies into its AI, with the photo of the shop's slip. */
export function aiPrompt(options: PromptOptions): string {
  const { design, brief } = options
  const fields = [
    ...design.elements.filter(isOwnerField).map((element) => {
      const required = 'printRequired' in element && element.printRequired ? '; required on the slip' : ''
      const example = element.type === 'number' ? (element.unit === 'kg' ? '2.50 kg' : '2') : element.type === 'checkbox' ? '✓' : 'Sample text'
      return `- {{${FIELD_PREFIX}${element.id}}}: ${element.label} (${element.type}; example: ${example}${required})`
    }),
    ...design.groups.map(group => `- {{${FIELD_PREFIX}${group.id}}}: ${group.label} (the chosen option's label)`),
  ]
  const paper = design.paper ? `${design.paper.widthMm} × ${design.paper.heightMm} mm` : 'not set yet'
  return [
    'You are designing a laundry shop\'s paper slip as HTML. The attached photo is the shop\'s current slip.',
    '',
    `Brief: ${brief || 'Keep the layout of the photo.'}`,
    `Canvas: ${design.width} × ${design.height} px (paper ${paper}). Fill it; nothing may fall outside.`,
    'Language: keep the slip\'s own labels as on the photo (Khmer and English as written there).',
    '',
    `Use only these tags: ${HTML_TAGS.map(tag => `<${tag}>`).join(', ')}. Only the class attribute: Tailwind utilities for layout (flex, grid, gap, padding, margin, width, height), text (size, weight, alignment), colours and borders. No images, links, scripts, styles or other attributes.`,
    'Draw count boxes and rows with bordered divs and flex layouts. Write & as &amp; and < as &lt;.',
    '',
    'Put values only through these placeholders (written exactly, with double braces, in text content only):',
    'Use {{order.number}} and {{order.qrCode}}. Keep prices, calculations, conditionals, and loops in Laundry.',
    ...Object.entries(TEXT_PLACEHOLDERS).map(([name, what]) => `- {{${name}}}: ${what}`),
    ...Object.entries(BLOCK_PLACEHOLDERS).map(([name, what]) => `- {{${name}}}: ${what} (a block: put it alone in its own div)`),
    ...(fields.length ? ['The shop\'s own fields:', ...fields] : []),
    '',
    'Answer with one JSON object and nothing else:',
    '{',
    `  "version": ${CATALOG_VERSION},`,
    '  "name": "A short name for this slip",',
    '  "html": "<div class=\\"flex flex-col gap-2 p-6\\">…</div>",',
    '  "reviewNotes": ["Anything a person should check, such as a label you were unsure of"]',
    '}',
  ].join('\n')
}
