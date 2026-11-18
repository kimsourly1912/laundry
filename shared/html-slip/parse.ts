/**
 * An HTML slip's markup, parsed as data (D39; product notes → AI-assisted design: "parse markup as
 * data, validate permitted elements and attributes"): a small, strict subset of HTML, never handed
 * to a browser or `innerHTML`. Every problem names its line and column, so an AI's answer can be
 * fixed where it went wrong. Shared by the Studio (as you type) and the server (on save, preview and
 * render).
 */

/** The tags a slip may use: blocks and inline text. No links, images, forms or scripts. */
export const HTML_TAGS = ['div', 'span', 'p', 'strong', 'b', 'em', 'small', 'br', 'hr'] as const
export type HtmlTag = typeof HTML_TAGS[number]
/** Tags with no closing tag in HTML, allowed or not: an unknown `<img>` must not swallow what follows. */
const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'])

export interface HtmlElement {
  tag: HtmlTag
  /** Tailwind utilities, as written. */
  classes: string[]
  children: HtmlNode[]
  /** Where the element starts, 1-based. */
  line: number
  column: number
}

/** Text, with its `{{placeholders}}` still in it; entities decoded. */
export interface HtmlText {
  text: string
  line: number
  column: number
}

export type HtmlNode = HtmlElement | HtmlText

export interface HtmlProblem {
  line: number
  column: number
  message: string
}

/** The largest markup a slip takes (the design is ≤ 256 KB in all). */
export const HTML_MAX_LENGTH = 64 * 1024

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' }

function decode(text: string): string {
  return text.replace(/&(#\d{1,6}|#x[\da-f]{1,6}|[a-z]+);/gi, (whole, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) return String.fromCodePoint(Number.parseInt(name.slice(2), 16))
    if (name.startsWith('#')) return String.fromCodePoint(Number(name.slice(1)))
    return ENTITIES[name.toLowerCase()] ?? whole
  })
}

/**
 * Parses the markup. Unknown tags and attributes, unclosed or stray tags, and text outside every
 * element are problems; the tree holds what could be read, so a preview can still show most of it.
 */
export function parseHtml(source: string): { nodes: HtmlNode[], problems: HtmlProblem[] } {
  const problems: HtmlProblem[] = []
  const root: HtmlElement = { tag: 'div', classes: [], children: [], line: 1, column: 1 }
  const stack: HtmlElement[] = [root]
  /** Each open element's tag as written: an unknown one is kept as a `div`, but closes by its own name. */
  const written = new Map<HtmlElement, string>([[root, '']])
  let index = 0
  let line = 1
  let column = 1

  function advance(text: string) {
    for (const char of text) {
      if (char === '\n') {
        line++
        column = 1
      }
      else {
        column++
      }
    }
    index += text.length
  }
  const problem = (message: string, at = { line, column }) => problems.push({ line: at.line, column: at.column, message })

  if (source.length > HTML_MAX_LENGTH) {
    problem(`The markup is longer than ${HTML_MAX_LENGTH} characters.`)
    return { nodes: [], problems }
  }

  while (index < source.length) {
    const rest = source.slice(index)
    const at = { line, column }
    if (rest.startsWith('<!--')) {
      const end = rest.indexOf('-->')
      if (end < 0) {
        problem('A comment is never closed (-->).', at)
        break
      }
      advance(rest.slice(0, end + 3))
      continue
    }
    const close = /^<\/\s*([a-z][a-z\d]*)\s*>/i.exec(rest)
    if (close) {
      const tag = close[1]!.toLowerCase()
      const open = stack.at(-1)!
      if (stack.length > 1 && written.get(open) === tag) stack.pop()
      else if (stack.some(element => element !== root && written.get(element) === tag)) {
        // Close the elements left open inside it, with a problem for each.
        while (stack.length > 1 && written.get(stack.at(-1)!) !== tag) {
          const unclosed = stack.pop()!
          problem(`<${written.get(unclosed)}> is never closed.`, unclosed)
        }
        stack.pop()
      }
      else {
        problem(`</${tag}> closes nothing.`, at)
      }
      advance(close[0])
      continue
    }
    const openTag = /^<\s*([a-z][a-z\d]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/i.exec(rest)
    if (openTag) {
      const tag = openTag[1]!.toLowerCase()
      const known = (HTML_TAGS as readonly string[]).includes(tag)
      if (!known) problem(`<${tag}> isn't allowed. Use ${HTML_TAGS.map(name => `<${name}>`).join(', ')}.`, at)
      const classes: string[] = []
      for (const attribute of openTag[2]!.matchAll(/([^\s=/>]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g)) {
        const name = attribute[1]!.toLowerCase()
        if (name !== 'class') {
          problem(`The attribute ${name} isn't allowed: only class.`, at)
          continue
        }
        const value = (attribute[2] ?? '').replace(/^["']|["']$/g, '')
        classes.push(...value.split(/\s+/).filter(Boolean))
      }
      const element: HtmlElement = { tag: (known ? tag : 'div') as HtmlTag, classes, children: [], line: at.line, column: at.column }
      stack.at(-1)!.children.push(element)
      written.set(element, tag)
      if (!VOID_TAGS.has(tag) && !openTag[3]) stack.push(element)
      advance(openTag[0])
      continue
    }
    if (rest.startsWith('<')) {
      problem('A < that starts no tag: write &lt; for the character.', at)
      advance('<')
      continue
    }
    const textEnd = rest.indexOf('<')
    const raw = textEnd < 0 ? rest : rest.slice(0, textEnd)
    // A text's place is its first character, not the line break before it.
    const lead = /^\s*/.exec(raw)![0]
    advance(lead)
    const textAt = { line, column }
    if (raw.trim()) {
      if (stack.length === 1) problem('Text outside every element: put it in a <div>.', textAt)
      else stack.at(-1)!.children.push({ text: decode(raw.replace(/\s+/g, ' ')), line: textAt.line, column: textAt.column })
    }
    advance(raw.slice(lead.length))
  }
  for (const unclosed of stack.slice(1).reverse()) problem(`<${written.get(unclosed)}> is never closed.`, unclosed)
  return { nodes: root.children, problems }
}

/** Every element and text of a tree, depth first. */
export function* walk(nodes: readonly HtmlNode[]): Generator<HtmlNode> {
  for (const node of nodes) {
    yield node
    if ('tag' in node) yield* walk(node.children)
  }
}
