<script setup lang="ts">
import type { CompletionSource } from '@codemirror/autocomplete'
import { acceptCompletion, autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { history, historyKeymap, indentLess, indentMore, insertNewlineAndIndent, selectLine } from '@codemirror/commands'
import { autoCloseTags, htmlLanguage } from '@codemirror/lang-html'
import { bracketMatching, foldGutter, foldKeymap, getIndentUnit, HighlightStyle, indentOnInput, LanguageSupport, syntaxHighlighting } from '@codemirror/language'
import type { Diagnostic } from '@codemirror/lint'
import { lintGutter, lintKeymap, setDiagnostics } from '@codemirror/lint'
import { gotoLine, highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { Compartment, EditorSelection, EditorState } from '@codemirror/state'
import type { Command } from '@codemirror/view'
import { drawSelection, dropCursor, EditorView, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, keymap, lineNumbers, rectangularSelection } from '@codemirror/view'
import { abbreviationTracker } from '@emmetio/codemirror6-plugin'
import { indentationMarkers } from '@replit/codemirror-indentation-markers'
import { vscodeKeymap as vscodeDefaults } from '@replit/codemirror-vscode-keymap'
import { tags } from '@lezer/highlight'
import { BLOCK_PLACEHOLDERS, TEXT_PLACEHOLDERS } from '#shared/html-slip/catalog'
import { UTILITY_SUGGESTIONS } from '#shared/html-slip/utilities'
import { formatHtml } from '#shared/html-slip/format'
import { completeAttributes, completeTags } from '../utils/html-completions'
import type { HtmlProblem } from '#shared/html-slip/parse'

const props = defineProps<{
  fields: { name: string, label: string }[]
  problems: HtmlProblem[]
  readOnly: boolean
  label: string
}>()
const source = defineModel<string>({ required: true })
const container = useTemplateRef('container')
const editing = new Compartment()
const appearance = new Compartment()
const colorMode = useColorMode()
let editor: EditorView | undefined

// Token colors are CSS variables (the <style> below), so one style reads well in light and dark.
const highlight = HighlightStyle.define([
  { tag: tags.tagName, color: 'var(--code-tag)' },
  { tag: tags.attributeName, color: 'var(--code-attribute)' },
  { tag: tags.attributeValue, color: 'var(--code-value)' },
  { tag: [tags.angleBracket, tags.documentMeta, tags.processingInstruction], color: 'var(--code-punctuation)' },
  { tag: tags.character, color: 'var(--code-entity)' },
  { tag: tags.comment, color: 'var(--code-comment)', fontStyle: 'italic' },
  { tag: tags.invalid, color: 'var(--ui-error)' },
])
// The `dark` flag switches CodeMirror's own selection, tooltip and panel colors.
const appearanceFor = (dark: boolean) => EditorView.theme({}, { dark })

const complete: CompletionSource = (context) => {
  const binding = context.matchBefore(/\{\{[\w.-]*/)
  if (binding) {
    const choices = [...Object.entries(TEXT_PLACEHOLDERS), ...Object.entries(BLOCK_PLACEHOLDERS), ...props.fields.map(field => [field.name, field.label] as const)]
    const suffix = context.state.sliceDoc(context.pos, context.pos + 2) === '}}' ? '}}' : ''
    return {
      from: binding.from,
      options: choices.map(([name, detail]) => ({
        label: `{{${name}}}`,
        detail,
        type: 'variable',
        apply: suffix ? `{{${name}` : `{{${name}}}`,
      })),
    }
  }
  const before = context.state.doc.lineAt(context.pos)
  const attribute = /\bclass\s*=\s*(["'])([^"']*)$/.exec(before.text.slice(0, context.pos - before.from))
  if (!attribute) return null
  const token = /[^\s]*$/.exec(attribute[2] ?? '')?.[0] ?? ''
  return {
    from: context.pos - token.length,
    options: UTILITY_SUGGESTIONS.map(label => ({ label, type: 'property' })),
  }
}

// Markup with problems is left as it is: the problems list is the place to look.
function format() {
  if (!editor || props.readOnly) return
  const current = editor.state.doc.toString()
  const formatted = formatHtml(current)
  if (formatted !== null && formatted !== current) {
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: formatted } })
  }
}

/** Puts `text` in place of the selection (Insert image), the cursor after it, and focus back. */
function insert(text: string) {
  if (!editor || props.readOnly) return
  const { from, to } = editor.state.selection.main
  editor.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, scrollIntoView: true })
  editor.focus()
}
defineExpose({ insert, format })

/**
 * Tab as in VS Code: accepts the open suggestion; with a selection, indents its lines; otherwise
 * inserts spaces to the next indent stop. Shift-Tab outdents. Escape then Tab still leaves the
 * editor (CodeMirror's tab focus mode), so a keyboard user is never trapped.
 */
const tab: Command = (view) => {
  if (acceptCompletion(view)) return true
  const { state } = view
  if (state.readOnly) return false
  if (state.selection.ranges.some(range => !range.empty)) return indentMore(view)
  const unit = getIndentUnit(state)
  view.dispatch(state.update(state.changeByRange((range) => {
    const column = range.head - state.doc.lineAt(range.head).from
    const spaces = ' '.repeat(unit - (column % unit))
    return { changes: { from: range.head, insert: spaces }, range: EditorSelection.cursor(range.head + spaces.length) }
  }), { scrollIntoView: true, userEvent: 'input' }))
  return true
}

/**
 * Ctrl+Enter as in VS Code ("Insert Line Below"): opens a new, indented line under the current one
 * and moves the cursor there, wherever it was in the line, and whatever is selected.
 */
const insertLineBelow: Command = (view) => {
  if (view.state.readOnly) return false
  view.dispatch(view.state.update({
    selection: EditorSelection.create(view.state.selection.ranges.map(range => EditorSelection.cursor(view.state.doc.lineAt(range.to).to))),
  }))
  return insertNewlineAndIndent(view)
}

/**
 * Ctrl+Shift+Enter ("Insert Line Above"): opens a new line above the current one, with the same
 * indentation, and puts the cursor on it.
 */
const insertLineAbove: Command = (view) => {
  const { state } = view
  if (state.readOnly) return false
  view.dispatch(state.update(state.changeByRange((range) => {
    const line = state.doc.lineAt(range.from)
    const indent = /^\s*/.exec(line.text)?.[0] ?? ''
    return { changes: { from: line.from, insert: `${indent}\n` }, range: EditorSelection.cursor(line.from + indent.length) }
  }), { scrollIntoView: true, userEvent: 'input' }))
  return true
}

/** VS Code's bindings that CodeMirror's defaults lack or place elsewhere; listed first, so they win. */
const vscodeKeymap = keymap.of([
  { key: 'Tab', run: tab, shift: indentLess },
  { key: 'Mod-Enter', run: insertLineBelow, preventDefault: true },
  { key: 'Mod-Shift-Enter', run: insertLineAbove, preventDefault: true },
  { key: 'Shift-Alt-f', run: () => {
    format()
    return true
  } },
  { key: 'Mod-l', run: selectLine, preventDefault: true },
  { key: 'Mod-g', run: gotoLine, preventDefault: true },
])

/**
 * CodeMirror's `basicSetup`, written out to change three things: the keymap above, Alt-click adds a
 * cursor (Ctrl/Cmd-click too), and Shift-Alt-drag selects a column, as in VS Code.
 */
const setup = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  EditorView.clickAddsSelectionRange.of(event => event.altKey || event.ctrlKey || event.metaKey),
  rectangularSelection({ eventFilter: event => event.altKey && event.shiftKey }),
  indentOnInput(),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  // Emmet (`div.p-4>span` + Tab) tracks its abbreviation and takes Tab itself, before the keymaps.
  abbreviationTracker(),
  // Our own bindings (Tab, Shift-Alt-F, Ctrl-L, Ctrl-G) come after the Emmet tracker, whose Tab expands an abbreviation first.
  vscodeKeymap,
  // Indent guides, the active block's one stronger.
  indentationMarkers({
    highlightActiveBlock: true,
    colors: { light: 'var(--ui-border)', dark: 'var(--ui-border)', activeLight: 'var(--ui-border-accented)', activeDark: 'var(--ui-border-accented)' },
  }),
  // Completion and brackets first so Enter, Escape and the arrows reach an open popup; then VS Code's own bindings.
  keymap.of([...closeBracketsKeymap, ...completionKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, ...lintKeymap, ...vscodeDefaults]),
]

const editable = (readOnly: boolean) => [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]

function showProblems() {
  if (!editor) return
  const { doc } = editor.state
  const diagnostics: Diagnostic[] = props.problems.map((problem) => {
    const line = doc.line(Math.max(1, Math.min(doc.lines, problem.line)))
    const from = Math.min(line.to, line.from + Math.max(0, problem.column - 1))
    return { from, to: Math.min(doc.length, from + 1), severity: 'error', message: problem.message }
  })
  editor.dispatch(setDiagnostics(editor.state, diagnostics))
}

onMounted(() => {
  if (!container.value) return
  editor = new EditorView({
    doc: source.value,
    parent: container.value,
    extensions: [
      setup,
      new LanguageSupport(htmlLanguage, [autoCloseTags]),
      htmlLanguage.data.of({ autocomplete: complete }),
      htmlLanguage.data.of({ autocomplete: completeAttributes }),
      htmlLanguage.data.of({ autocomplete: completeTags }),
      syntaxHighlighting(highlight),
      lintGutter(),
      editing.of(editable(props.readOnly)),
      appearance.of(appearanceFor(colorMode.value === 'dark')),
      EditorView.contentAttributes.of({ 'aria-label': props.label, 'autocapitalize': 'off', 'spellcheck': 'false' }),
      EditorView.lineWrapping,
      EditorView.theme({
        // Fills the panel it sits in; the theme tokens keep it readable in light and dark.
        '&': { height: '100%', fontSize: '13px' },
        '.cm-scroller, .cm-tooltip-autocomplete': { fontFamily: 'var(--font-editor, "JetBrains Mono", ui-monospace, Consolas, monospace)' },
        '.cm-scroller': { overflow: 'auto' },
        '.cm-gutters': { backgroundColor: 'var(--ui-bg-muted)', color: 'var(--ui-text-dimmed)', borderRight: '1px solid var(--ui-border)' },
        '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'color-mix(in oklab, var(--ui-primary) 8%, transparent)' },
        '.cm-content': { caretColor: 'var(--ui-text-highlighted)' },
        '.cm-cursor': { borderLeftColor: 'var(--ui-text-highlighted)' },
        '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
          backgroundColor: 'color-mix(in oklab, var(--ui-primary) 25%, transparent)',
        },
        '.cm-tooltip': { backgroundColor: 'var(--ui-bg-elevated)', color: 'var(--ui-text)', border: '1px solid var(--ui-border)' },
        '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--ui-primary)', color: 'var(--ui-bg)' },
        '.cm-foldPlaceholder': { backgroundColor: 'var(--ui-bg-accented)', color: 'var(--ui-text-muted)', border: 'none' },
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && update.state.doc.toString() !== source.value) source.value = update.state.doc.toString()
      }),
    ],
  })
  showProblems()
})
watch(source, (value) => {
  if (editor && editor.state.doc.toString() !== value) {
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } })
  }
})
watch(() => props.problems, showProblems, { flush: 'post' })
watch(() => props.readOnly, value => editor?.dispatch({ effects: editing.reconfigure(editable(value)) }))
watch(() => colorMode.value, value => editor?.dispatch({ effects: appearance.reconfigure(appearanceFor(value === 'dark')) }))
onBeforeUnmount(() => editor?.destroy())
</script>

<template>
  <!-- Format (Shift+Alt+F) is the page's editor-tab action, through the exposed `format`. -->
  <div
    ref="container"
    class="code h-full overflow-hidden bg-default"
    data-testid="html-source"
  />
</template>

<style scoped>
/* 700 shades on the light background, 300 on the dark one, for text contrast (ui.md → Contrast). */
.code {
  --code-tag: var(--ui-color-primary-700);
  --code-attribute: var(--ui-color-warning-700);
  --code-value: var(--ui-color-success-700);
  --code-entity: var(--ui-color-secondary-700);
  --code-punctuation: var(--ui-text-muted);
  --code-comment: var(--ui-text-muted);
}

:global(.dark) .code {
  --code-tag: var(--ui-color-primary-300);
  --code-attribute: var(--ui-color-warning-300);
  --code-value: var(--ui-color-success-300);
  --code-entity: var(--ui-color-secondary-300);
}
</style>
