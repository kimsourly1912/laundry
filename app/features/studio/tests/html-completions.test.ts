import { describe, expect, it } from 'vitest'
import { CompletionContext } from '@codemirror/autocomplete'
import type { Completion, CompletionResult } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { HTML_TAGS, SVG_ATTRIBUTES } from '#shared/html-slip/parse'
import { completeAttributes, completeTags } from '../utils/html-completions'

/** `|` marks the cursor. */
function run(source: (context: CompletionContext) => CompletionResult | null | Promise<CompletionResult | null>, text: string, explicit = false) {
  const pos = text.indexOf('|')
  const doc = text.replace('|', '')
  const state = EditorState.create({ doc, selection: { anchor: pos } })
  return { state, pos, result: source(new CompletionContext(state, pos, explicit)) as CompletionResult | null }
}

/** Accepts `label` the way the popup does, on a stub view, and returns the document with `|` at the cursor. */
function accept(state: EditorState, result: CompletionResult, label: string) {
  const option = result.options.find(item => item.label === label) as Completion
  let next = state
  const dispatch = (spec: Parameters<EditorState['update']>[0]) => {
    next = state.update(spec).state
  }
  const view = { state, dispatch } as unknown as EditorView
  const to = state.selection.main.head
  ;(option.apply as (view: EditorView, completion: Completion, from: number, to: number) => void)(view, option, result.from, to)
  const cursor = next.selection.main.head
  return `${next.doc.sliceString(0, cursor)}|${next.doc.sliceString(cursor)}`
}

const labels = (result: CompletionResult | null) => result?.options.map(option => option.label) ?? []

describe('tag completions', () => {
  it('offers only the tags a slip allows after <', () => {
    const { result } = run(completeTags, '<|')
    expect(labels(result)).toEqual([...HTML_TAGS])
    expect(labels(result)).not.toContain('a')
    expect(labels(result)).not.toContain('table')
  })

  it('also offers the SVG shapes inside an <svg>, and not after it closes', () => {
    expect(labels(run(completeTags, '<svg viewBox="0 0 1 1"><|').result)).toContain('path')
    expect(labels(run(completeTags, '<svg></svg><|').result)).not.toContain('path')
  })

  it('offers a bare tag name only at the start of a line', () => {
    expect(run(completeTags, '  sp|').result?.from).toBe(2)
    expect(run(completeTags, 'Total sp|').result).toBeNull()
    expect(run(completeTags, '|').result).toBeNull()
  })

  it('writes the whole element with the cursor between the tags', () => {
    const typed = run(completeTags, '<sp|')
    expect(accept(typed.state, typed.result!, 'span')).toBe('<span>|</span>')
    const bare = run(completeTags, '<div>\n  sp|')
    expect(accept(bare.state, bare.result!, 'span')).toBe('<div>\n  <span>|</span>')
  })

  it('writes a void tag on its own and keeps an existing > after the name', () => {
    const typed = run(completeTags, '<b|')
    expect(accept(typed.state, typed.result!, 'br')).toBe('<br>|')
    const existing = run(completeTags, '<sp| class="a">')
    expect(accept(existing.state, existing.result!, 'span')).toBe('<span| class="a">')
    const closed = run(completeTags, '<sp|>')
    expect(accept(closed.state, closed.result!, 'span')).toBe('<span|>')
  })
})

describe('attribute completions', () => {
  it('offers class in an HTML tag, and src as well on an image', () => {
    expect(labels(run(completeAttributes, '<div |', true).result)).toEqual(['class'])
    expect(labels(run(completeAttributes, '<img |', true).result)).toEqual(['class', 'src'])
    expect(labels(run(completeAttributes, '<span cl|').result)).toEqual(['class'])
  })

  it('offers geometry and paint inside an SVG element', () => {
    expect(labels(run(completeAttributes, '<svg><rect |', true).result)).toEqual([...SVG_ATTRIBUTES])
    expect(labels(run(completeAttributes, '<svg |', true).result)).toContain('class')
  })

  it('stays quiet outside a tag, in an attribute value and when nothing is typed', () => {
    expect(run(completeAttributes, '<div>te|').result).toBeNull()
    expect(run(completeAttributes, '<div class="p-4 |', true).result).toBeNull()
    expect(run(completeAttributes, '<div class="p-4" |', true).result).not.toBeNull()
    expect(run(completeAttributes, '<div |').result).toBeNull()
  })

  it('writes name="" with the cursor inside the quotes, and just the name before an =', () => {
    const typed = run(completeAttributes, '<div cl|')
    expect(accept(typed.state, typed.result!, 'class')).toBe('<div class="|"')
    const existing = run(completeAttributes, '<div cl|="p-4">')
    expect(accept(existing.state, existing.result!, 'class')).toBe('<div class|="p-4">')
  })
})
