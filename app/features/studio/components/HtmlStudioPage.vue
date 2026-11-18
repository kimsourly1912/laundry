<script setup lang="ts">
/**
 * The Studio for an HTML slip: the markup with its problems as you type and the server's SVG
 * preview with a blank, typical or crowded sample, side by side in a resizable splitter from `lg`.
 * On a phone the two panels are tabs (Edit, Preview) and switching keeps the draft. Intake fields
 * open in a slideover and the paper size in a popover from the header. Copy AI prompt and Import
 * JSON follow the v1 contract. The draft saves itself (`useTemplateDraft`); Publish runs the same
 * checks as the server.
 */
import { CANVAS_MAX_SIDE, CANVAS_MIN_SIDE, HTML_INTAKE_PRESETS, MAX_ELEMENTS, PAPER_MAX_MM, PAPER_MIN_MM } from '#shared/contracts/slip-design'
import type { HtmlIntakePreset, SlipDesign } from '#shared/contracts/slip-design'
import { TEMPLATE_NAME_MAX } from '#shared/contracts/templates'
import type { TemplateDetail } from '#shared/contracts/templates'
import { checkHtml, FIELD_PREFIX } from '#shared/html-slip/catalog'
import { aiPrompt, readAiAnswer } from '#shared/html-slip/ai'
import type { AnswerProblem } from '#shared/html-slip/ai'
import { newHtmlSlip } from '#shared/html-slip/presets'
import { SAMPLES } from '#shared/html-slip/sample'
import type { Sample } from '#shared/html-slip/sample'
import { publishProblems } from '#shared/slip/checks'
import { createElement } from '#shared/slip/elements'
import { isOwnerField } from '#shared/slip/fields'
import type { OwnerField } from '#shared/slip/fields'
import { useTemplateDraft } from '../composables/useTemplateDraft'
import HtmlCodeEditor from './HtmlCodeEditor.vue'
import TemplateShopsModal from './TemplateShopsModal.vue'

const props = defineProps<{ template?: TemplateDetail }>()

const { t, te } = useI18n()
const toast = useToast()
const { can } = useSession()
const draft = props.template ? useTemplateDraft(props.template) : undefined
const initial = props.template?.design ?? newHtmlSlip()
const design = shallowRef<SlipDesign>(initial)
const newName = ref('')
const creating = ref(false)
const created = shallowRef<TemplateDetail>()
const createError = shallowRef<unknown>()
const name = computed(() => draft?.name.value ?? newName.value)
const readOnly = computed(() => !can('template:write') || draft?.saved.value.status === 'archived' || creating.value || Boolean(created.value))
const saveStatus = computed(() => draft?.status.value ?? (creating.value ? 'saving' : 'pending'))
const saveDot = computed(() => ({
  saved: 'bg-success',
  saving: 'bg-info animate-pulse',
  pending: 'bg-info',
  failed: 'bg-error',
  conflict: 'bg-error',
} as Record<string, string>)[saveStatus.value] ?? 'bg-info')

function change(next: SlipDesign) {
  design.value = next
  draft?.saveDesign(next)
}

function rename(value: string) {
  if (draft && value.trim()) draft.rename(value.trim())
  else if (!draft) newName.value = value
}

useUnsavedChanges(() => !draft && !created.value && (design.value !== initial || Boolean(newName.value)))

async function saveFirstDraft() {
  const templateName = newName.value.trim()
  if (!templateName || creating.value || created.value) return
  createError.value = undefined
  creating.value = true
  try {
    created.value = await apiFetch<TemplateDetail>('/platform/templates', {
      method: 'POST',
      body: { name: templateName, start: { kind: 'htmlDraft', design: design.value } },
    })
    await navigateTo(`/platform/templates/${created.value.id}`, { replace: true })
  }
  catch (error) {
    createError.value = error
  }
  finally {
    creating.value = false
  }
}

// --- Edit: the markup, checked as you type ---

const html = computed({
  get: () => design.value.html ?? '',
  set: value => change({ ...design.value, html: value }),
})
const check = computed(() => checkHtml(html.value, design.value))

// --- Fields: the owner's form (D35's fields), placed in the markup as {{fields.<id>}} ---

const fields = computed(() => design.value.elements.filter(isOwnerField))
const bindings = computed(() => [
  ...fields.value.map(field => ({ name: `${FIELD_PREFIX}${field.id}`, label: field.label })),
  ...design.value.groups.map(group => ({ name: `${FIELD_PREFIX}${group.id}`, label: group.label })),
])
const placeholderOf = (id: string) => `{{${FIELD_PREFIX}${id}}}`

function updateField(field: OwnerField, patch: { label?: string, required?: boolean, printRequired?: boolean, priceKey?: string }) {
  change({ ...design.value, elements: design.value.elements.map(item => item.id === field.id ? { ...field, ...patch } : item) })
}
function remove(field: OwnerField) {
  change({ ...design.value, elements: design.value.elements.filter(item => item.id !== field.id), fillOrder: design.value.fillOrder.filter(key => key !== field.id) })
}
function hasPrintBinding(field: OwnerField): boolean {
  return 'printRequired' in field && Boolean(field.printRequired)
}

const newLabel = ref('')
const newFieldKey = ref('')
const newPriceKey = ref('')
const newType = ref<'count' | 'weight' | 'text' | 'checkbox'>('count')
const fieldTypes = computed(() => (['count', 'weight', 'text', 'checkbox'] as const).map(value => ({ value, label: t(`studio.html.fieldType.${value}`) })))
const usesPrice = computed(() => newType.value === 'count' || newType.value === 'weight')
const fieldKey = computed(() => newFieldKey.value.trim())
const priceKey = computed(() => newPriceKey.value.trim())
const validPriceKey = (key: string) => !key || /^[a-z\d][a-z\d._-]{0,39}$/.test(key)
const validFieldKey = computed(() =>
  /^[a-z][a-z\d_]{0,39}$/.test(fieldKey.value)
  && fieldKey.value !== 'paid'
  && ![...design.value.elements, ...design.value.groups].some(item => item.id === fieldKey.value),
)
const canAddField = computed(() => Boolean(newLabel.value.trim() && validFieldKey.value
  && (!usesPrice.value || validPriceKey(priceKey.value)) && design.value.elements.length < MAX_ELEMENTS))

function addField() {
  if (!canAddField.value) return
  const label = newLabel.value.trim()
  const id = fieldKey.value
  const kg = newType.value === 'weight'
  const field = newType.value === 'text'
    ? createElement('textField', { id }, { label })
    : newType.value === 'checkbox'
      ? createElement('checkbox', { id }, { label })
      : createElement('number', { id }, { label, priceKey: priceKey.value || undefined, decimals: kg ? 2 : 0, max: kg ? 100 : 999, unit: kg ? 'kg' : '' })
  change({ ...design.value, elements: [...design.value.elements, field], fillOrder: [...design.value.fillOrder, id] })
  newLabel.value = ''
  newFieldKey.value = ''
  newPriceKey.value = ''
}
function setPriceKey(field: OwnerField, value: string) {
  const key = value.trim()
  if (validPriceKey(key)) updateField(field, { priceKey: key || undefined })
}
function changePreset(preset: HtmlIntakePreset) {
  if (preset === design.value.htmlPreset) return
  const currentPreset = newHtmlSlip(design.value.htmlPreset)
  const customized = html.value !== currentPreset.html || JSON.stringify(design.value.elements) !== JSON.stringify(currentPreset.elements)
  if (customized && !window.confirm(t('studio.html.replacePreset'))) return
  change({ ...newHtmlSlip(preset), width: design.value.width, height: design.value.height, paper: design.value.paper })
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

// --- Preview: the server's SVG, with a sample order ---

const sample = ref<Sample>('typical')
const sampleItems = computed(() => SAMPLES.map(value => ({ value, label: t(`studio.html.samples.${value}`) })))
const previewUrl = ref<string>()
const previewError = shallowRef<unknown>()
const previewCurrent = ref(false)
const previewLoading = ref(true)
const zoom = ref(100)
let previewTimer: ReturnType<typeof setTimeout> | undefined
let previewTicket = 0
let controller: AbortController | undefined

async function loadPreview() {
  if (check.value.problems.length) return
  clearTimeout(previewTimer)
  controller?.abort()
  controller = new AbortController()
  const ticket = ++previewTicket
  previewLoading.value = true
  try {
    const blob = await apiFetch<Blob>('/platform/templates/preview', {
      method: 'POST',
      body: { design: design.value, sample: sample.value },
      responseType: 'blob',
      signal: controller.signal,
    })
    if (ticket !== previewTicket) return
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = URL.createObjectURL(blob)
    previewError.value = undefined
    previewCurrent.value = true
  }
  catch (error) {
    if (ticket === previewTicket) previewError.value = error
  }
  finally {
    if (ticket === previewTicket) previewLoading.value = false
  }
}
watch([design, sample], () => {
  if (!import.meta.client) return
  clearTimeout(previewTimer)
  previewTicket++
  controller?.abort()
  previewCurrent.value = false
  previewError.value = undefined
  previewLoading.value = !check.value.problems.length
  if (previewLoading.value) previewTimer = setTimeout(loadPreview, 500)
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => {
  clearTimeout(previewTimer)
  previewTicket++
  controller?.abort()
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
  if (!draft && !newName.value) newName.value = read.answer.name
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
  if (!draft) return
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
const fieldsOpen = ref(false)
const paperOpen = ref(false)
const paperWidth = ref<number | null>(initial.paper?.widthMm ?? null)
const paperHeight = ref<number | null>(initial.paper?.heightMm ?? null)
function setPaper() {
  const widthMm = paperWidth.value
  const heightMm = paperHeight.value
  if (widthMm === null || heightMm === null || [widthMm, heightMm].some(side => side < PAPER_MIN_MM || side > PAPER_MAX_MM)) return
  const factor = Math.max(CANVAS_MIN_SIDE / Math.min(widthMm, heightMm), Math.min(8, CANVAS_MAX_SIDE / Math.max(widthMm, heightMm)))
  const width = Math.round(widthMm * factor)
  const height = Math.round(heightMm * factor)
  if (width > CANVAS_MAX_SIDE || height > CANVAS_MAX_SIDE) {
    toast.add({ title: t('studio.html.paperRatio'), color: 'error' })
    return
  }
  change({ ...design.value, width, height, paper: { widthMm, heightMm } })
  paperOpen.value = false
}

// --- Layout: a resizable splitter from lg; on a phone the tab picks the one panel shown ---

const tab = ref<'edit' | 'preview'>('edit')
const tabs = computed(() => [
  { label: t('studio.html.tabs.edit'), value: 'edit' },
  { label: t('studio.html.tabs.preview'), value: 'preview' },
])
// Below lg the active panel takes the whole row (beating the splitter's inline flex) and the other hides.
const panels = computed(() => (['edit', 'preview'] as const).map(value => ({
  id: `html-studio-${value}`,
  slot: value,
  defaultSize: 50,
  minSize: 30,
  class: tab.value === value ? 'max-lg:flex-[1_1_100%]!' : 'max-lg:hidden',
})))
</script>

<template>
  <div class="flex h-dvh flex-col bg-default">
    <header class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-default px-3 py-2">
      <UButton
        :label="t('studio.back')"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        to="/platform/templates"
        class="font-semibold"
      />
      <template v-if="!template">
        <USeparator
          orientation="vertical"
          class="hidden h-6 sm:block"
        />
        <h1 class="hidden font-semibold text-highlighted sm:block">
          {{ t('studio.new.title') }}
        </h1>
      </template>
      <UInput
        :model-value="name"
        :maxlength="TEMPLATE_NAME_MAX"
        :placeholder="t('studio.html.name')"
        :disabled="readOnly"
        class="min-w-0 flex-1 sm:max-w-xs"
        :aria-label="t('studio.html.name')"
        @update:model-value="!draft && rename(String($event ?? ''))"
        @change="draft && rename(($event.target as HTMLInputElement).value)"
        @keydown.enter="($event.target as HTMLInputElement).blur()"
      />
      <span class="flex items-center gap-1.5 text-xs text-muted">
        <span
          class="size-2 shrink-0 rounded-full"
          :class="saveDot"
          aria-hidden="true"
        />
        <span data-testid="save-status">{{ t(`studio.save.${saveStatus}`) }}</span>
      </span>
      <div class="ms-auto flex flex-wrap gap-2">
        <UButton
          :label="t('studio.html.fieldsTitle')"
          icon="i-lucide-sliders-horizontal"
          :ui="{ label: 'max-sm:sr-only' }"
          color="neutral"
          variant="outline"
          data-testid="open-fields"
          @click="fieldsOpen = true"
        />
        <UPopover
          v-model:open="paperOpen"
          :content="{ align: 'end' }"
        >
          <UButton
            :label="t('studio.paper.title')"
            icon="i-lucide-ruler"
            :ui="{ label: 'max-sm:sr-only' }"
            color="neutral"
            variant="outline"
          />
          <template #content>
            <form
              class="w-72 space-y-3 p-4"
              @submit.prevent="setPaper"
            >
              <p class="text-sm text-muted">
                {{ t('studio.paper.description') }}
              </p>
              <div class="grid grid-cols-2 gap-2">
                <UFormField :label="t('studio.paper.width')">
                  <UInputNumber
                    v-model="paperWidth"
                    :min="PAPER_MIN_MM"
                    :max="PAPER_MAX_MM"
                    size="sm"
                    :disabled="readOnly"
                  />
                </UFormField>
                <UFormField :label="t('studio.paper.height')">
                  <UInputNumber
                    v-model="paperHeight"
                    :min="PAPER_MIN_MM"
                    :max="PAPER_MAX_MM"
                    size="sm"
                    :disabled="readOnly"
                  />
                </UFormField>
              </div>
              <UButton
                type="submit"
                :label="t('studio.paper.apply')"
                block
                :disabled="readOnly || !paperWidth || !paperHeight"
              />
            </form>
          </template>
        </UPopover>
        <UButton
          v-if="draft"
          :label="t('studio.html.shops')"
          icon="i-lucide-store"
          :ui="{ label: 'max-sm:sr-only' }"
          color="neutral"
          variant="outline"
          @click="shopsOpen = true"
        />
        <UButton
          v-if="!draft"
          :label="t('studio.html.saveDraft')"
          :disabled="!newName.trim() || readOnly"
          :loading="creating"
          @click="saveFirstDraft"
        />
        <UButton
          v-if="draft && !readOnly"
          :label="t('studio.publish.open')"
          icon="i-lucide-upload"
          :disabled="!draft.saved.value.hasUnpublishedChanges && draft.status.value === 'saved'"
          data-testid="html-publish"
          @click="publishOpen = true"
        />
      </div>
    </header>

    <UAlert
      v-if="createError"
      class="mx-3 mt-3"
      color="error"
      :title="errorText(createError, t, te)"
    />
    <UTabs
      v-model="tab"
      :items="tabs"
      :content="false"
      variant="link"
      class="w-full px-3 lg:hidden"
      data-testid="html-tabs"
    />

    <USplitter
      id="html-studio"
      auto-save-id="html-studio"
      :items="panels"
      class="min-h-0 flex-1 p-3"
      :ui="{ handle: 'flex items-center justify-center max-lg:hidden' }"
    >
      <template #resize-handle>
        <span class="h-10 w-1 rounded-full bg-accented transition-colors group-hover:bg-primary group-data-[resize-handle-state=drag]:bg-primary" />
      </template>

      <!-- HTML: toolbar, the editor filling the panel, and its problems. -->
      <template #edit>
        <section class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-default bg-default">
          <div class="flex flex-wrap items-center gap-2 border-b border-default px-4 py-2.5">
            <h2 class="me-auto text-base font-semibold text-highlighted">
              {{ t('studio.html.markupTitle') }}
            </h2>
            <UButton
              :label="t('studio.html.copyPrompt')"
              icon="i-lucide-copy"
              color="neutral"
              variant="outline"
              size="sm"
              @click="promptOpen = true"
            />
            <UButton
              v-if="!readOnly"
              :label="t('studio.html.importJson')"
              icon="i-lucide-download"
              color="neutral"
              variant="outline"
              size="sm"
              data-testid="import-answer"
              @click="importOpen = true"
            />
          </div>
          <UAlert
            v-if="reviewNotes.length"
            class="m-3 mb-0 w-auto"
            color="info"
            variant="subtle"
            icon="i-lucide-message-square-warning"
            :title="t('studio.html.reviewNotes')"
            :description="reviewNotes.join(' · ')"
            close
            @update:open="reviewNotes = []"
          />
          <div class="min-h-0 flex-1">
            <ClientOnly>
              <HtmlCodeEditor
                v-model="html"
                :read-only="readOnly"
                :fields="bindings"
                :problems="check.problems"
                :label="t('studio.html.markup')"
              />
              <template #fallback>
                <USkeleton class="size-full rounded-none" />
              </template>
            </ClientOnly>
          </div>
          <div class="border-t border-default px-4 py-2.5">
            <ul
              v-if="check.problems.length"
              class="max-h-28 space-y-1 overflow-auto text-sm text-error"
              data-testid="html-problems"
            >
              <li
                v-for="(problem, index) in check.problems"
                :key="index"
                class="flex gap-2"
              >
                <UIcon
                  name="i-lucide-circle-alert"
                  class="mt-0.5 size-4 shrink-0"
                />
                <span>{{ t('studio.html.at', { line: problem.line, column: problem.column }) }} {{ problem.message }}</span>
              </li>
            </ul>
            <p
              v-else
              class="flex items-center gap-2 text-sm text-default"
              data-testid="html-ok"
            >
              <UIcon
                name="i-lucide-circle-check"
                class="size-5 text-success"
              />
              {{ t('studio.html.ok') }}
            </p>
          </div>
        </section>
      </template>

      <!-- Preview: samples, zoom and download over a dotted canvas. -->
      <template #preview>
        <section class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-default bg-default">
          <div class="flex flex-wrap items-center gap-2 border-b border-default px-4 py-2">
            <h2 class="me-auto text-base font-semibold text-highlighted">
              {{ t('studio.html.tabs.preview') }}
            </h2>
            <URadioGroup
              v-model="sample"
              :items="sampleItems"
              variant="table"
              orientation="horizontal"
              size="sm"
              indicator="hidden"
              :legend="t('studio.html.sample')"
              :ui="{ fieldset: 'flex-nowrap', legend: 'sr-only', item: 'h-8 items-center px-2.5 py-0', wrapper: 'ms-0', label: 'leading-none' }"
            />
            <UFieldGroup size="sm">
              <UButton
                :label="t('studio.canvas.fit')"
                color="neutral"
                variant="outline"
                @click="zoom = 100"
              />
              <UButton
                icon="i-lucide-minus"
                color="neutral"
                variant="outline"
                :aria-label="t('studio.html.zoomOut')"
                :disabled="zoom <= 50"
                @click="zoom -= 25"
              />
              <UButton
                icon="i-lucide-plus"
                color="neutral"
                variant="outline"
                :aria-label="t('studio.html.zoomIn')"
                :disabled="zoom >= 200"
                @click="zoom += 25"
              />
            </UFieldGroup>
            <UButton
              v-if="previewUrl"
              :label="t('studio.html.downloadSvg')"
              :to="previewCurrent ? previewUrl : undefined"
              :disabled="!previewCurrent"
              :loading="previewLoading"
              external
              download="laundry-slip.svg"
              icon="i-lucide-download"
              color="neutral"
              variant="outline"
              size="sm"
            />
          </div>
          <div class="min-h-0 flex-1 overflow-auto bg-muted bg-[radial-gradient(var(--ui-border-accented)_1px,transparent_1px)] bg-size-[16px_16px]">
            <div class="flex min-h-full items-center justify-center p-6">
              <img
                v-if="previewUrl"
                :src="previewUrl"
                :alt="t('studio.html.previewAlt')"
                :style="{ width: `${zoom}%` }"
                class="block h-auto max-w-none bg-white shadow-sm"
                data-testid="html-preview"
              >
              <USkeleton
                v-else-if="previewLoading"
                class="w-full"
                :style="{ aspectRatio: `${design.width} / ${design.height}` }"
              />
              <p
                v-else-if="!previewError"
                class="text-sm text-muted"
              >
                {{ t('studio.html.previewInvalid') }}
              </p>
            </div>
          </div>
          <PageLoadError
            v-if="previewError"
            class="border-t border-default p-3"
            :error="previewError"
            @retry="loadPreview"
          />
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-default px-4 py-2.5 text-sm text-muted">
            <span v-if="design.paper">{{ design.paper.widthMm }} × {{ design.paper.heightMm }} mm</span>
            <span
              v-if="!previewCurrent && previewUrl"
              role="status"
              class="text-xs text-warning"
            >
              {{ t('studio.html.previewStale') }}
            </span>
            <span class="ms-auto tabular-nums">{{ design.width }} × {{ design.height }} px</span>
          </div>
        </section>
      </template>
    </USplitter>

    <USlideover
      v-model:open="fieldsOpen"
      :title="t('studio.html.fieldsTitle')"
      :description="t('studio.html.fieldsHint')"
    >
      <template #body>
        <div class="space-y-4 @container">
          <div
            v-if="!draft"
            class="flex flex-wrap items-center gap-2"
          >
            <span class="text-sm text-muted">{{ t('studio.html.intakePreset') }}</span>
            <UButton
              v-for="preset in HTML_INTAKE_PRESETS"
              :key="preset"
              :label="t(`studio.html.presets.${preset}`)"
              :variant="preset === design.htmlPreset ? 'solid' : 'outline'"
              :aria-pressed="preset === design.htmlPreset"
              :disabled="readOnly"
              size="sm"
              @click="changePreset(preset)"
            />
          </div>
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
                @change="updateField(field, { label: ($event.target as HTMLInputElement).value })"
              />
              <code class="text-xs text-muted">{{ placeholderOf(field.id) }}</code>
              <UInput
                v-if="field.type === 'number'"
                :model-value="field.priceKey ?? ''"
                :disabled="readOnly"
                :aria-label="t('studio.field.priceKey')"
                :placeholder="t('studio.field.priceKey')"
                class="w-28"
                size="sm"
                @change="setPriceKey(field, ($event.target as HTMLInputElement).value)"
              />
              <UCheckbox
                v-if="field.type !== 'phone' && field.type !== 'amount'"
                :model-value="field.required"
                :disabled="readOnly"
                :label="t('studio.html.intakeRequired')"
                @update:model-value="updateField(field, { required: $event === true })"
              />
              <UCheckbox
                v-if="field.type !== 'phone' && field.type !== 'amount'"
                :model-value="hasPrintBinding(field)"
                :disabled="readOnly"
                :label="t('studio.html.printRequired')"
                @update:model-value="updateField(field, { printRequired: $event === true })"
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
            class="grid gap-3 @md:grid-cols-2"
            @submit.prevent="addField"
          >
            <UFormField :label="t('studio.html.fieldLabel')">
              <UInput
                v-model="newLabel"
                :maxlength="60"
                class="w-full"
                data-testid="count-label"
              />
            </UFormField>
            <UFormField
              :label="t('studio.html.fieldKey')"
              :error="fieldKey && !validFieldKey ? t('studio.html.fieldKeyError') : undefined"
            >
              <UInput
                v-model="newFieldKey"
                :maxlength="40"
                class="w-full"
                autocapitalize="off"
                data-testid="field-key"
              />
            </UFormField>
            <UFormField :label="t('studio.html.fieldType.title')">
              <USelect
                v-model="newType"
                :items="fieldTypes"
                class="w-full"
              />
            </UFormField>
            <UFormField
              v-if="usesPrice"
              :label="t('studio.field.priceKey')"
              :error="!validPriceKey(priceKey) ? t('studio.html.priceKeyError') : undefined"
            >
              <UInput
                v-model="newPriceKey"
                class="w-full"
                autocapitalize="off"
                data-testid="count-key"
              />
            </UFormField>
            <UButton
              type="submit"
              :label="t('studio.html.addField')"
              icon="i-lucide-plus"
              class="justify-self-start @md:col-span-2"
              :disabled="!canAddField"
              data-testid="add-count"
            />
          </form>
        </div>
      </template>
    </USlideover>

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
      :title="t('studio.publish.title', { number: (draft?.saved.value.latestVersion ?? 0) + 1 })"
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
      v-if="template && draft"
      v-model:open="shopsOpen"
      :template-id="template.id"
      :published="draft.saved.value.latestVersion !== null"
    />
  </div>
</template>
