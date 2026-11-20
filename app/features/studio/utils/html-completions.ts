/**
 * The HTML editor's tag and attribute completions. Only what a slip allows is offered (parse.ts is the
 * allowlist), so the popup never suggests a tag or attribute that publishing would refuse. Tag names
 * come after `<` and, Emmet-style, as a bare name at the start of a line; accepting one writes the whole
 * element with the cursor between its tags.
 */
import type { Completion, CompletionContext, CompletionSource } from '@codemirror/autocomplete'
import { HTML_TAGS, SVG_ATTRIBUTES, SVG_TAGS } from '#shared/html-slip/parse'

const VOID_TAGS = new Set(['br', 'hr', 'img'])
const NAME = /^[\w-]*$/

function tagOption(name: string, bare: boolean): Completion {
  return {
    label: name,
    type: 'keyword',
    detail: bare ? `<${name}>` : undefined,
    apply: (view, _completion, from, to) => {
      const open = bare ? `<${name}>` : `${name}>`
      // Renaming a tag that already has its `>` (with or without attributes): write the name only.
      const after = view.state.sliceDoc(to)
      const close = after.indexOf('>')
      const next = after.indexOf('<')
      const hasBracket = close !== -1 && (next === -1 || close < next)
      const text = hasBracket ? name : VOID_TAGS.has(name) ? open : `${open}</${name}>`
      const cursor = from + (VOID_TAGS.has(name) || hasBracket ? text.length : open.length)
      view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: cursor }, userEvent: 'input.complete' })
    },
  }
}

/** Inside an `<svg>` drawing the SVG elements are allowed too. */
function tagsAt(context: CompletionContext) {
  const before = context.state.sliceDoc(0, context.pos)
  const insideSvg = before.lastIndexOf('<svg') > before.lastIndexOf('</svg')
  return insideSvg ? [...HTML_TAGS, ...SVG_TAGS.filter(name => name !== 'svg')] : [...HTML_TAGS]
}

export const completeTags: CompletionSource = (context) => {
  const afterBracket = context.matchBefore(/<[\w-]*/)
  if (afterBracket) {
    return { from: afterBracket.from + 1, options: tagsAt(context).map(name => tagOption(name, false)), validFor: NAME }
  }
  const word = context.matchBefore(/[a-z][\w-]*/)
  if (!word) return null
  const line = context.state.doc.lineAt(word.from)
  if (line.text.slice(0, word.from - line.from).trim()) return null
  return { from: word.from, options: tagsAt(context).map(name => tagOption(name, true)), validFor: NAME }
}

/** Attribute names inside an open tag: `class` (and `src` on an image), or an SVG element's geometry and paint. */
export const completeAttributes: CompletionSource = (context) => {
  const name = context.matchBefore(/[\w-]*/)
  if (!name || (name.from === name.to && !context.explicit)) return null
  const before = context.state.sliceDoc(0, name.from)
  const open = /<([a-zA-Z][\w-]*)(?:\s+[^<>]*?)?\s$/.exec(before.slice(before.lastIndexOf('<')))
  if (!open || before.lastIndexOf('<') < before.lastIndexOf('>')) return null
  // An odd number of quotes means the cursor is inside an attribute's value, not at a name.
  if ((open[0].match(/"/g)?.length ?? 0) % 2 || (open[0].match(/'/g)?.length ?? 0) % 2) return null
  const tag = open[1]!
  const names: readonly string[] = (HTML_TAGS as readonly string[]).includes(tag) && tag !== 'svg'
    ? (tag === 'img' ? ['class', 'src'] : ['class'])
    : [...SVG_ATTRIBUTES, ...(tag === 'svg' ? ['class'] : [])]
  return {
    from: name.from,
    options: names.map(label => ({
      label,
      type: 'property',
      apply: (view, _completion, from, to) => {
        const hasValue = view.state.sliceDoc(to, to + 1) === '='
        const text = hasValue ? label : `${label}=""`
        view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + (hasValue ? text.length : text.length - 1) }, userEvent: 'input.complete' })
      },
    })),
    validFor: NAME,
  }
}
