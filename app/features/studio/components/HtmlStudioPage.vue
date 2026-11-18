<script setup lang="ts">
/**
 * The Studio for an HTML slip (D39; product notes → Template Studio; guide → sheets 08, 09): the
 * markup with its problems as you type, the owner's fields, and the server's preview with a blank,
 * typical or crowded sample. On a phone the three are tabs (Edit, Fields, Preview) and switching
 * keeps the draft; from `lg` the editor and the preview sit side by side. Copy AI prompt and Import
 * AI answer follow the v1 contract. The draft saves itself (`useTemplateDraft`); Publish runs the
 * same checks as the server.
 */
import type { SlipDesign, SlipElement } from '#shared/contracts/slip-design'
import type { TemplateDetail } from '#shared/contracts/templates'
import { checkHtml, FIELD_PREFIX } from '#shared/html-slip/catalog'
import { aiPrompt, readAiAnswer } from '#shared/html-slip/ai'
import type { AnswerProblem } from '#shared/html-slip/ai'
import { SAMPLES } from '#shared/html-slip/sample'
import type { Sample } from '#shared/html-slip/sample'
import { publishProblems } from '#shared/slip/checks'
import { createElement, newKey } from '#shared/slip/elements'
import { isOwnerField } from '#shared/slip/fields'
import { useTemplateDraft } from '../composables/useTemplateDraft'
import TemplateShopsModal from './TemplateShopsModal.vue'

const props = defineProps<{ template: TemplateDetail }>()

const { t, te } = useI18n()
const toast = useToast()
const { can } = useSession()
const draft = useTemplateDraft(props.template)
const design = shallowRef<SlipDesign>(props.template.design)
const readOnly = computed(() => !can('template:write') || draft.saved.value.status === 'archived')

function change(next: SlipDesign) {
  design.value = next
  draft.saveDesign(next)
}

// --- Edit: the markup, checked as you type ---

const html = computed({
  get: () => design.value.html ?? '',
  set: value => change({ ...design.value, html: value }),
})
const check = computed(() => checkHtml(html.value, design.value))

// --- Fields: the owner's form (D35's fields), placed in the markup as {{fields.<id>}} ---

const fields = computed(() => design.value.elements.filter(isOwnerField))
/** A field's placeholder, `{{fields.<id>}}`, as the markup writes it. */
const placeholderOf = (id: string) => `{{${FIELD_PREFIX}${id}}}`
function relabel(element: SlipElement, label: string) {
  change({ ...design.value, elements: design.value.elements.map(item => (item.id === element.id && 'label' in item ? { ...item, label } as SlipElement : item)) })
}
function remove(element: SlipElement) {
  change({ ...design.value, elements: design.value.elements.filter(item => item.id !== element.id), fillOrder: design.value.fillOrder.filter(key => key !== element.id) })
}
const newLabel = ref('')
const newKeyText = ref('')
const newKg = ref(false)
function addCount() {
  const label = newLabel.value.trim()
  if (!label) return
  const priceKey = newKeyText.value.trim().toLowerCase() || undefined
  if (priceKey && !/^[a-z\d][a-z\d._-]{0,39}$/.test(priceKey)) return
  const element = createElement('number', { id: newKey() }, { label, priceKey, decimals: newKg.value ? 2 : 0, max: newKg.value ? 100 : 999, unit: newKg.value ? 'kg' : '' })
  change({ ...design.value, elements: [...design.value.elements, element], fillOrder: [...design.value.fillOrder, element.id] })
  newLabel.value = ''
  newKeyText.value = ''
  newKg.value = false
}
async function copyText(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: done, color: 'success', icon: 'i-lucide-clipboard-check' })
  }
  catch {
    toast.add({ title: t('studio.html.copyFailed'), color: 'error' })
  }
}

// --- Preview: the server's PNG, with a sample order ---

const sample = ref<Sample>('typical')
const previewUrl = ref<string>()
const previewError = shallowRef<unknown>()
let previewTimer: ReturnType<typeof setTimeout> | undefined
let previewTicket = 0
async function loadPreview() {
  const ticket = ++previewTicket
  try {
    const blob = await apiFetch<Blob>(`/platform/templates/${props.template.id}/preview`, { method: 'POST', body: { design: design.value, sample: sample.value }, responseType: 'blob' })
    if (ticket !== previewTicket) return
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = URL.createObjectURL(blob)
    previewError.value = undefined
  }
  catch (error) {
    if (ticket === previewTicket) previewError.value = error
  }
}
watch([design, sample], () => {
  clearTimeout(previewTimer)
  previewTimer = setTimeout(loadPreview, 500)
}, { immediate: true })
onBeforeUnmount(() => {
  clearTimeout(previewTimer)
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})

// --- AI: copy the prompt, import the answer (v1) ---

const promptOpen = ref(false)
const brief = ref('')
const importOpen = ref(false)
const pasted = ref('')
const importProblems = ref<AnswerProblem[]>([])
const reviewNotes = ref<string[]>([])
function importAnswer() {
  const read = readAiAnswer(pasted.value)
  if ('problems' in read) {
    importProblems.value = read.problems
    return
  }
  importProblems.value = []
  reviewNotes.value = read.answer.reviewNotes ?? []
  change({ ...design.value, html: read.answer.html })
  importOpen.value = false
  pasted.value = ''
  tab.value = 'edit'
}

// --- Publish, shops, paper ---

const problems = computed(() => publishProblems(design.value))
const publishOpen = ref(false)
const publishing = ref(false)
async function publish() {
  publishing.value = true
  try {
    await draft.publish()
    publishOpen.value = false
    toast.add({ title: t('studio.publish.done', { number: draft.saved.value.latestVersion ?? 1 }), color: 'success', icon: 'i-lucide-circle-check' })
  }
  catch (error) {
    toast.add({ title: errorText(error, t, te), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    publishing.value = false
  }
}
const shopsOpen = ref(false)
const paperWidth = ref<number | null>(props.template.design.paper?.widthMm ?? null)
const paperHeight = ref<number | null>(props.template.design.paper?.heightMm ?? null)
function setPaper() {
  if (!paperWidth.value || !paperHeight.value) return
  change({ ...design.value, paper: { widthMm: paperWidth.value, heightMm: paperHeight.value } })
}

// --- Layout: tabs on a phone, panes from lg ---

const tab = ref<'edit' | 'fields' | 'preview'>('edit')
const tabs = computed(() => [
  { label: t('studio.html.tabs.edit'), value: 'edit' },
  { label: t('studio.html.tabs.fields'), value: 'fields' },
  { label: t('studio.html.tabs.preview'), value: 'preview' },
])
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-default">
    <header class="flex flex-wrap items-center gap-2 border-b border-default px-3 py-2">
      <UButton
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        to="/platform/templates"
        :aria-label="t('common.actions.back')"
      />
      <UInput
        :model-value="draft.name.value"
        :disabled="readOnly"
        class="min-w-0 flex-1 sm:max-w-xs"
        :aria-label="t('studio.html.name')"
        @change="draft.rename(($event.target as HTMLInputElement).value.trim() || draft.name.value)"
      />
      <span
        class="text-xs text-muted"
        data-testid="save-status"
      >{{ t(`studio.save.${draft.status.value}`) }}</span>
      <div class="ms-auto flex flex-wrap gap-2">
        <UButton
          :label="t('studio.html.shops')"
          icon="i-lucide-store"
          color="neutral"
          variant="outline"
          size="sm"
          @click="shopsOpen = true"
        />
        <UButton
          v-if="!readOnly"
          :label="t('studio.publish.open')"
          icon="i-lucide-upload"
          size="sm"
          :disabled="!draft.saved.value.hasUnpublishedChanges && draft.status.value === 'saved'"
          data-testid="html-publish"
          @click="publishOpen = true"
        />
      </div>
    </header>

    <UTabs
      v-model="tab"
      :items="tabs"
      :content="false"
      variant="link"
      class="w-full px-3 lg:hidden"
      data-testid="html-tabs"
    />

    <div class="grid flex-1 gap-4 p-3 lg:grid-cols-2">
      <!-- Edit and Fields: one of them on a phone, both stacked from lg. -->
      <section
        class="space-y-3"
        :class="tab === 'edit' ? '' : 'hidden lg:block'"
      >
        <div class="flex flex-wrap gap-2">
          <UButton
            :label="t('studio.html.copyPrompt')"
            icon="i-lucide-clipboard-copy"
            color="neutral"
            variant="outline"
            size="sm"
            @click="promptOpen = true"
          />
          <UButton
            v-if="!readOnly"
            :label="t('studio.html.importAnswer')"
            icon="i-lucide-file-input"
            color="neutral"
            variant="outline"
            size="sm"
            data-testid="import-answer"
            @click="importOpen = true"
          />
        </div>
        <UAlert
          v-if="reviewNotes.length"
          color="info"
          variant="subtle"
          icon="i-lucide-message-square-warning"
          :title="t('studio.html.reviewNotes')"
          :description="reviewNotes.join(' · ')"
        />
        <UTextarea
          v-model="html"
          :disabled="readOnly"
          :rows="18"
          autoresize
          :maxrows="40"
          class="w-full"
          :ui="{ base: 'font-mono text-xs' }"
          :aria-label="t('studio.html.markup')"
          spellcheck="false"
          data-testid="html-source"
        />
        <ul
          v-if="check.problems.length"
          class="space-y-1 text-sm text-error"
          data-testid="html-problems"
        >
          <li
            v-for="(problem, index) in check.problems"
            :key="index"
          >
            {{ t('studio.html.at', { line: problem.line, column: problem.column }) }} {{ problem.message }}
          </li>
        </ul>
        <p
          v-else
          class="text-sm text-success"
          data-testid="html-ok"
        >
          {{ t('studio.html.ok') }}
        </p>
      </section>

      <section
        class="space-y-3"
        :class="tab === 'fields' ? '' : 'hidden lg:block'"
      >
        <h2 class="font-semibold text-highlighted">
          {{ t('studio.html.fieldsTitle') }}
        </h2>
        <p class="text-sm text-muted">
          {{ t('studio.html.fieldsHint') }}
        </p>
        <ul class="divide-y divide-default rounded-md border border-default">
          <li
            v-for="field in fields"
            :key="field.id"
            class="flex flex-wrap items-center gap-2 px-3 py-2"
          >
            <UInput
              :model-value="field.label"
              :disabled="readOnly"
              size="sm"
              class="min-w-0 flex-1"
              :aria-label="t('studio.html.fieldLabel')"
              @change="relabel(field, ($event.target as HTMLInputElement).value)"
            />
            <code class="text-xs text-muted">{{ placeholderOf(field.id) }}</code>
            <UBadge
              v-if="field.type === 'number' && field.priceKey"
              :label="field.priceKey"
              variant="subtle"
              size="sm"
            />
            <UButton
              icon="i-lucide-copy"
              color="neutral"
              variant="ghost"
              size="xs"
              :aria-label="t('studio.html.copyPlaceholder')"
              @click="copyText(placeholderOf(field.id), t('studio.html.copied'))"
            />
            <UButton
              v-if="!readOnly"
              icon="i-lucide-trash-2"
              color="neutral"
              variant="ghost"
              size="xs"
              :aria-label="t('studio.html.removeField')"
              @click="remove(field)"
            />
          </li>
        </ul>
        <form
          v-if="!readOnly"
          class="flex flex-wrap items-end gap-2"
          @submit.prevent="addCount"
        >
          <UFormField :label="t('studio.html.countLabel')">
            <UInput
              v-model="newLabel"
              size="sm"
              data-testid="count-label"
            />
          </UFormField>
          <UFormField :label="t('studio.field.priceKey')">
            <UInput
              v-model="newKeyText"
              size="sm"
              placeholder="shirt"
              autocapitalize="off"
              data-testid="count-key"
            />
          </UFormField>
          <UCheckbox
            v-model="newKg"
            :label="t('studio.html.byKg')"
          />
          <UButton
            type="submit"
            :label="t('studio.html.addCount')"
            icon="i-lucide-plus"
            size="sm"
            :disabled="!newLabel.trim()"
            data-testid="add-count"
          />
        </form>
        <div class="flex flex-wrap items-end gap-2">
          <UFormField :label="t('studio.paper.width')">
            <UInputNumber
              v-model="paperWidth"
              :min="20"
              :max="400"
              size="sm"
              :disabled="readOnly"
            />
          </UFormField>
          <UFormField :label="t('studio.paper.height')">
            <UInputNumber
              v-model="paperHeight"
              :min="20"
              :max="400"
              size="sm"
              :disabled="readOnly"
            />
          </UFormField>
          <UButton
            :label="t('studio.paper.apply')"
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="readOnly || !paperWidth || !paperHeight"
            @click="setPaper"
          />
        </div>
      </section>

      <!-- Preview: its own tab on a phone, the right pane from lg. -->
      <section
        class="space-y-3 lg:col-start-2 lg:row-span-2 lg:row-start-1"
        :class="tab === 'preview' ? '' : 'hidden lg:block'"
      >
        <URadioGroup
          v-model="sample"
          :items="SAMPLES.map(value => ({ label: t(`studio.html.samples.${value}`), value }))"
          orientation="horizontal"
          variant="table"
          size="sm"
          :aria-label="t('studio.html.sample')"
        />
        <div
          class="w-full overflow-hidden rounded border border-default bg-white"
          :style="{ aspectRatio: `${design.width} / ${design.height}` }"
        >
          <img
            v-if="previewUrl"
            :src="previewUrl"
            :alt="t('studio.html.previewAlt')"
            class="h-full w-full"
            data-testid="html-preview"
          >
          <USkeleton
            v-else
            class="h-full w-full"
          />
        </div>
        <PageLoadError
          v-if="previewError"
          :error="previewError"
          @retry="loadPreview"
        />
        <p class="text-xs text-muted">
          {{ design.width }} × {{ design.height }} px<template v-if="design.paper">
            · {{ design.paper.widthMm }} × {{ design.paper.heightMm }} mm
          </template>
        </p>
      </section>
    </div>

    <UModal
      v-model:open="promptOpen"
      :title="t('studio.html.copyPrompt')"
      :description="t('studio.html.promptHint')"
    >
      <template #body>
        <UFormField :label="t('studio.html.brief')">
          <UTextarea
            v-model="brief"
            :rows="3"
            class="w-full"
            :placeholder="t('studio.html.briefPlaceholder')"
          />
        </UFormField>
      </template>
      <template #footer>
        <UButton
          :label="t('studio.html.copy')"
          icon="i-lucide-clipboard-copy"
          @click="copyText(aiPrompt({ design, brief }), t('studio.html.promptCopied')); promptOpen = false"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="importOpen"
      :title="t('studio.html.importAnswer')"
      :description="t('studio.html.importHint')"
    >
      <template #body>
        <UTextarea
          v-model="pasted"
          :rows="10"
          class="w-full"
          :ui="{ base: 'font-mono text-xs' }"
          :aria-label="t('studio.html.answer')"
          data-testid="answer-text"
        />
        <ul
          v-if="importProblems.length"
          class="mt-2 space-y-1 text-sm text-error"
          data-testid="answer-problems"
        >
          <li
            v-for="(problem, index) in importProblems"
            :key="index"
          >
            {{ problem.where }}: {{ problem.message }}
          </li>
        </ul>
      </template>
      <template #footer>
        <UButton
          :label="t('studio.html.import')"
          :disabled="!pasted.trim()"
          data-testid="answer-import"
          @click="importAnswer"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="publishOpen"
      :title="t('studio.publish.title', { number: (draft.saved.value.latestVersion ?? 0) + 1 })"
    >
      <template #body>
        <ul
          v-if="problems.errors.length"
          class="space-y-1 text-sm text-error"
        >
          <li
            v-for="(problem, index) in problems.errors"
            :key="index"
          >
            {{ t(`studio.publish.errors.${problem.code}`, { name: problem.key ?? '' }) }}
          </li>
        </ul>
        <ul
          v-if="problems.warnings.length"
          class="mt-2 space-y-1 text-sm text-warning"
        >
          <li
            v-for="(problem, index) in problems.warnings"
            :key="index"
          >
            {{ t(`studio.publish.warnings.${problem.code}`, { name: problem.key ?? '' }) }}
          </li>
        </ul>
        <p
          v-if="!problems.errors.length && !problems.warnings.length"
          class="text-sm"
        >
          {{ t('studio.publish.allGood') }}
        </p>
      </template>
      <template #footer>
        <UButton
          :label="t('studio.publish.open')"
          :disabled="problems.errors.length > 0"
          :loading="publishing"
          data-testid="html-publish-confirm"
          @click="publish"
        />
      </template>
    </UModal>

    <TemplateShopsModal
      v-model:open="shopsOpen"
      :template-id="template.id"
      :published="draft.saved.value.latestVersion !== null"
    />
  </div>
</template>
