/**
 * An HTML slip's markup, parsed as data (D39; product notes → AI-assisted design: "parse markup as
 * data, validate permitted elements and attributes"): a small, strict subset of HTML, never handed
 * to a browser or `innerHTML`. Every problem names its line and column, so an AI's answer can be
 * fixed where it went wrong. Shared by the Studio (as you type) and the server (on save, preview and
 * render).
 */

/**
 * The tags a slip may use: blocks, inline text, a library image and inline SVG (D41). No links,
 * forms or scripts.
 */
export const HTML_TAGS = ['div', 'span', 'p', 'strong', 'b', 'em', 'small', 'br', 'hr', 'img', 'svg'] as const
export type HtmlTag = typeof HTML_TAGS[number]
/** Tags with no closing tag in HTML, allowed or not: an unknown `<input>` must not swallow what follows. */
const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'])

export interface HtmlElement {
  tag: HtmlTag
  /** Tailwind utilities, as written. */
  classes: string[]
  children: HtmlNode[]
  /** `<img>`: the library image's id, from `src="image:<id>"`. */
  image?: string
  /** `<svg>`: the drawing, as the allowlist kept it. */
  svg?: SvgElement
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

/** An inline SVG element after the allowlist: names as SVG spells them, values checked. */
export interface SvgElement {
  tag: SvgTag
  attributes: [name: string, value: string][]
  children: SvgElement[]
}

/** The SVG elements a drawing may use (D41): shapes, groups, gradients and clips. No text. */
export const SVG_TAGS = ['svg', 'g', 'defs', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'linearGradient', 'radialGradient', 'stop', 'clipPath'] as const
export type SvgTag = typeof SVG_TAGS[number]

/** Geometry and paint only: no `href`, `style`, events or animation. */
export const SVG_ATTRIBUTES = [
  'viewBox', 'width', 'height', 'preserveAspectRatio', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy',
  'd', 'points', 'transform', 'id', 'opacity', 'offset',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin',
  'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stop-color', 'stop-opacity', 'clip-path', 'clip-rule',
  'gradientUnits', 'gradientTransform', 'spreadMethod', 'clipPathUnits',
] as const

const PAINT_ATTRIBUTES = new Set(['fill', 'stroke', 'stop-color'])
/** HTML reads names in any case; SVG needs them spelled as here (`viewBox`, `linearGradient`). */
const SVG_TAG_NAMES = new Map<string, SvgTag>(SVG_TAGS.map(name => [name.toLowerCase(), name]))
const SVG_ATTRIBUTE_NAMES = new Map<string, string>(SVG_ATTRIBUTES.map(name => [name.toLowerCase(), name]))
/** Taken and dropped: the builder writes its own `xmlns`. */
const SVG_IGNORED = new Set(['xmlns', 'xmlns:xlink', 'version'])
const LOCAL_URL = /^url\(#[a-z][\w-]*\)$/i
const PAINT = /^(?:none|currentcolor|transparent|#[\da-f]{3,8}|[a-z]+|rgba?\([\d\s.,%]+\)|url\(#[a-z][\w-]*\))$/i
/** Numbers, lists, path data and transforms: no `url(`, quotes, `<`, `&` or `:`. */
const PLAIN = /^[\w\s.,%#()+-]*$/

/** A library image's `src`: `image:` and the image's id. */
const IMAGE_SRC = /^image:([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})$/i

export interface HtmlProblem {
  line: number
  column: number
  message: string
}

/** The largest markup a slip takes (the design is ≤ 256 KB in all). */
export const HTML_MAX_LENGTH = 64 * 1024

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' }
const ATTRIBUTE = /([^\s=/>]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g
const OPEN_TAG = /^<\s*([a-z][a-z\d]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/i
const CLOSE_TAG = /^<\/\s*([a-z][a-z\d]*)\s*>/i

function decode(text: string): string {
  return text.replace(/&(#\d{1,6}|#x[\da-f]{1,6}|[a-z]+);/gi, (whole, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) return String.fromCodePoint(Number.parseInt(name.slice(2), 16))
    if (name.startsWith('#')) return String.fromCodePoint(Number(name.slice(1)))
    return ENTITIES[name.toLowerCase()] ?? whole
  })
}

function attributesOf(source: string): { name: string, value: string }[] {
  return [...source.matchAll(ATTRIBUTE)].map(match => ({ name: match[1]!, value: decode((match[2] ?? '').replace(/^["']|["']$/g, '')) }))
}

/** Why an SVG attribute's value is refused; nothing when it's fine. */
function svgValueProblem(name: string, value: string): string | undefined {
  const trimmed = value.trim()
  if (PAINT_ATTRIBUTES.has(name)) return PAINT.test(trimmed) ? undefined : `${name}="${value}" isn't a colour: use a colour, none, currentColor or url(#id).`
  if (name === 'clip-path') return LOCAL_URL.test(trimmed) ? undefined : 'clip-path takes url(#id) only.'
  if (name === 'id') return /^[a-z][\w-]*$/i.test(value) ? undefined : `id="${value}" must start with a letter, then letters, digits, - or _.`
  return PLAIN.test(value) ? undefined : `${name}="${value}" has characters a drawing doesn't use.`
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

  /** One SVG element from its tag and attributes; `undefined` when the allowlist drops it. */
  function svgElement(tag: string, attributeSource: string, at: { line: number, column: number }): SvgElement | undefined {
    const name = SVG_TAG_NAMES.get(tag.toLowerCase())
    if (!name) {
      if (/^(?:text|tspan|textpath)$/i.test(tag)) problem(`<${tag}> isn't drawn inside an <svg>: write the words in HTML beside it.`, at)
      else problem(`<${tag}> isn't allowed inside an <svg>. Use ${SVG_TAGS.filter(item => item !== 'svg').map(item => `<${item}>`).join(', ')}.`, at)
      return undefined
    }
    const attributes: [string, string][] = []
    for (const { name: raw, value } of attributesOf(attributeSource)) {
      const lower = raw.toLowerCase()
      if (SVG_IGNORED.has(lower) || (name === 'svg' && lower === 'class')) continue
      const canonical = SVG_ATTRIBUTE_NAMES.get(lower)
      if (!canonical) {
        problem(`The attribute ${raw} isn't allowed inside an <svg> (geometry and colours only).`, at)
        continue
      }
      const issue = svgValueProblem(canonical, value)
      if (issue) problem(issue, at)
      else attributes.push([canonical, value.trim()])
    }
    return { tag: name, attributes, children: [] }
  }

  /** The drawing inside an `<svg>`, up to its `</svg>`; a dropped element drops what it holds. */
  function readSvg(drawing: SvgElement | undefined, at: { line: number, column: number }) {
    const open: { element: SvgElement | undefined, tag: string, at: { line: number, column: number } }[] = [{ element: drawing, tag: 'svg', at }]
    while (index < source.length && open.length) {
      const rest = source.slice(index)
      const here = { line, column }
      if (rest.startsWith('<!--')) {
        const end = rest.indexOf('-->')
        if (end < 0) {
          problem('A comment is never closed (-->).', here)
          advance(rest)
          break
        }
        advance(rest.slice(0, end + 3))
        continue
      }
      const close = CLOSE_TAG.exec(rest)
      if (close) {
        const tag = close[1]!.toLowerCase()
        if (open.some(item => item.tag.toLowerCase() === tag)) {
          while (open.at(-1)!.tag.toLowerCase() !== tag) {
            const unclosed = open.pop()!
            problem(`<${unclosed.tag}> is never closed.`, unclosed.at)
          }
          open.pop()
        }
        else {
          problem(`</${tag}> closes nothing.`, here)
        }
        advance(close[0])
        continue
      }
      const openTag = OPEN_TAG.exec(rest)
      if (openTag) {
        const parent = open.at(-1)!.element
        const element = svgElement(openTag[1]!, openTag[2]!, here)
        if (element && parent) parent.children.push(element)
        if (!openTag[3]) open.push({ element: parent && element, tag: openTag[1]!, at: here })
        advance(openTag[0])
        continue
      }
      if (rest.startsWith('<')) {
        problem('A < that starts no tag: write &lt; for the character.', here)
        advance('<')
        continue
      }
      const textEnd = rest.indexOf('<')
      const raw = textEnd < 0 ? rest : rest.slice(0, textEnd)
      if (raw.trim()) problem('Text inside an <svg> isn\'t drawn: write the words in HTML beside it.', { line: here.line, column: here.column + raw.length - raw.trimStart().length })
      advance(raw)
    }
    for (const unclosed of open.reverse()) problem(`<${unclosed.tag}> is never closed.`, unclosed.at)
  }

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
    const close = CLOSE_TAG.exec(rest)
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
    const openTag = OPEN_TAG.exec(rest)
    if (openTag) {
      const tag = openTag[1]!.toLowerCase()
      const known = (HTML_TAGS as readonly string[]).includes(tag)
      if (!known) problem(`<${tag}> isn't allowed. Use ${HTML_TAGS.map(name => `<${name}>`).join(', ')}.`, at)
      const element: HtmlElement = { tag: (known ? tag : 'div') as HtmlTag, classes: [], children: [], line: at.line, column: at.column }
      let hasSrc = false
      for (const { name: raw, value } of attributesOf(openTag[2]!)) {
        const name = raw.toLowerCase()
        if (name === 'class') {
          element.classes.push(...value.split(/\s+/).filter(Boolean))
          continue
        }
        if (tag === 'svg') continue
        if (tag === 'img' && name === 'src') {
          hasSrc = true
          const image = IMAGE_SRC.exec(value.trim())
          if (image) element.image = image[1]!.toLowerCase()
          else problem(`src="${value}" isn't a library image. Use Insert image, which writes src="image:<id>".`, at)
          continue
        }
        problem(`The attribute ${name} isn't allowed: only class${tag === 'img' ? ' and src' : ''}.`, at)
      }
      if (tag === 'img' && !hasSrc) problem('<img> needs src="image:<id>": use Insert image.', at)
      stack.at(-1)!.children.push(element)
      if (tag === 'svg') {
        element.svg = svgElement('svg', openTag[2]!, at)
        advance(openTag[0])
        if (!openTag[3]) readSvg(element.svg, at)
        const names = new Set(element.svg?.attributes.map(([name]) => name))
        if (!names.has('viewBox') && !(names.has('width') && names.has('height'))) problem('<svg> needs a viewBox (or a width and a height).', at)
        continue
      }
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

/** The library images the markup draws, by id, in order, once each. */
export function imagesIn(nodes: readonly HtmlNode[]): string[] {
  const ids = new Set<string>()
  for (const node of walk(nodes)) {
    if ('tag' in node && node.image) ids.add(node.image)
  }
  return [...ids]
}

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/** A drawing as a standalone SVG document, written only from what the allowlist kept. */
export function svgDocument(element: SvgElement): string {
  const attributes = element.attributes.map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`).join('')
  const xmlns = element.tag === 'svg' ? ' xmlns="http://www.w3.org/2000/svg"' : ''
  const inner = element.children.map(svgDocument).join('')
  return inner ? `<${element.tag}${xmlns}${attributes}>${inner}</${element.tag}>` : `<${element.tag}${xmlns}${attributes}/>`
}
