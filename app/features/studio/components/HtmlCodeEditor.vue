<script setup lang="ts">
import type { CompletionSource } from '@codemirror/autocomplete'
import { html, htmlLanguage } from '@codemirror/lang-html'
import type { Diagnostic } from '@codemirror/lint'
import { lintGutter, setDiagnostics } from '@codemirror/lint'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { BLOCK_PLACEHOLDERS, TEXT_PLACEHOLDERS, UTILITY_SUGGESTIONS } from '#shared/html-slip/catalog'
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
      html(),
      htmlLanguage.data.of({ autocomplete: complete }),
      lintGutter(),
      editing.of(editable(props.readOnly)),
      EditorView.contentAttributes.of({ 'aria-label': props.label, autocapitalize: 'off', spellcheck: 'false' }),
      EditorView.lineWrapping,
      EditorView.theme({
        '&': { minHeight: '24rem', maxHeight: '65vh', fontSize: '13px' },
        '.cm-scroller': { overflow: 'auto' },
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
  <div
    ref="container"
    class="overflow-hidden rounded-md border border-default bg-default"
    data-testid="html-source"
  />
</template>
