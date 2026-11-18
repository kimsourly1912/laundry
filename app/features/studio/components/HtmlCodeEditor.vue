<script setup lang="ts">
import type { CompletionSource } from '@codemirror/autocomplete'
import { html, htmlLanguage } from '@codemirror/lang-html'
import type { Diagnostic } from '@codemirror/lint'
import { lintGutter, setDiagnostics } from '@codemirror/lint'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { BLOCK_PLACEHOLDERS, TEXT_PLACEHOLDERS, UTILITY_SUGGESTIONS } from '#shared/html-slip/catalog'
import { formatHtml } from '#shared/html-slip/format'
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
let editor: EditorView | undefined

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

const { t } = useI18n()
// Markup with problems is left as it is: the problems list is the place to look.
function format() {
  if (!editor || props.readOnly) return
  const current = editor.state.doc.toString()
  const formatted = formatHtml(current)
  if (formatted !== null && formatted !== current) {
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: formatted } })
  }
}

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
      basicSetup,
      keymap.of([{ key: 'Shift-Alt-f', run: () => {
        format()
        return true
      } }]),
      html(),
      htmlLanguage.data.of({ autocomplete: complete }),
      lintGutter(),
      editing.of(editable(props.readOnly)),
      EditorView.contentAttributes.of({ 'aria-label': props.label, 'autocapitalize': 'off', 'spellcheck': 'false' }),
      EditorView.lineWrapping,
      EditorView.theme({
        // Fills the panel it sits in; the theme tokens keep it readable in light and dark.
        '&': { height: '100%', fontSize: '13px' },
        '.cm-scroller': { overflow: 'auto' },
        '.cm-gutters': { backgroundColor: 'var(--ui-bg-muted)', color: 'var(--ui-text-dimmed)', borderRight: '1px solid var(--ui-border)' },
        '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'color-mix(in oklab, var(--ui-primary) 8%, transparent)' },
        '.cm-cursor': { borderLeftColor: 'var(--ui-text-highlighted)' },
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
onBeforeUnmount(() => editor?.destroy())
</script>

<template>
  <div class="relative h-full">
    <div
      ref="container"
      class="h-full overflow-hidden bg-default"
      data-testid="html-source"
    />
    <UButton
      class="absolute right-4 top-2 z-10"
      size="xs"
      color="neutral"
      variant="subtle"
      icon="i-lucide-align-left"
      :label="t('studio.html.format')"
      :disabled="readOnly"
      data-testid="html-format"
      @click="format"
    />
  </div>
</template>
