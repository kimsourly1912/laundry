<script setup lang="ts">
/**
 * The Studio for an HTML slip, laid out like VS Code: an activity bar on the left edge picks the
 * sidebar's view (Intake fields, Presets, Images, AI, and Paper size at the bottom), then the markup
 * with its problems as you type, then the server's SVG preview with a blank, typical or crowded
 * sample. From `lg` the sidebar, editor and preview sit in one resizable splitter; the sidebar
 * collapses when its open icon is picked again or it's dragged narrower than its minimum. On a phone
 * the editor and preview are tabs (Edit, Preview), switching keeps the draft, and the sidebar opens
 * as a slideover from the left. A new template starts with no HTML: the empty editor offers a
 * preset, which fills the markup and its intake fields, or the author types or imports their own.
 * The draft saves itself (`useTemplateDraft`); Publish runs the same checks as the server.
 */
import type { HtmlIntakePreset, Paper, SlipDesign } from '#shared/contracts/slip-design'
import { TEMPLATE_NAME_MAX } from '#shared/contracts/templates'
import type { CustomSample, ImageSummary, TemplateDetail } from '#shared/contracts/templates'
import { checkHtml, FIELD_PREFIX } from '#shared/html-slip/catalog'
import type { AiAnswer } from '#shared/html-slip/ai'
import { newHtmlSlip } from '#shared/html-slip/presets'
import { customSampleFieldProblems, SAMPLES } from '#shared/html-slip/sample'
import type { Sample } from '#shared/html-slip/sample'
import { publishProblems } from '#shared/slip/checks'
import { isOwnerField } from '#shared/slip/fields'
import { useSlipPrint } from '~/features/slip-fill'
import { useHtmlTemplatePreview } from '../composables/useHtmlTemplatePreview'
import { useHtmlPreviewViewport } from '../composables/useHtmlPreviewViewport'
import { useTemplateDraft } from '../composables/useTemplateDraft'
import { useWideScreen } from '../composables/useWideScreen'
import { pickSidebarView } from '../utils/html-sidebar'
import type { SidebarView } from '../utils/html-sidebar'
import HtmlActivityBar from './HtmlActivityBar.vue'
import HtmlCodeEditor from './HtmlCodeEditor.vue'
import HtmlCustomSampleModal from './HtmlCustomSampleModal.vue'
import HtmlStudioSidebar from './HtmlStudioSidebar.vue'
import TemplateShopsModal from './TemplateShopsModal.vue'

const props = defineProps<{ template?: TemplateDetail }>()

const { t, te } = useI18n()
const toast = useToast()
const { can } = useSession()
const draft = props.template ? useTemplateDraft(props.template) : undefined
// A new template keeps the by-weight fields and paper until a preset says otherwise, but no markup.
const initial = props.template?.design ?? { ...newHtmlSlip(), html: '' }
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
const empty = computed(() => !html.value.trim())

/** The owner's form (D35's fields) as `{{fields.<id>}}` completions; the Intake fields view edits them. */
const bindings = computed(() => [
  ...design.value.elements.filter(isOwnerField).map(field => ({ name: `${FIELD_PREFIX}${field.id}`, label: field.label })),
  ...design.value.groups.map(group => ({ name: `${FIELD_PREFIX}${group.id}`, label: group.label })),
])

// --- Sidebar: the activity bar picks the view; a panel from lg, a slideover below ---

const wide = useWideScreen(1024)
const sidebarView = ref<SidebarView>('fields')
const panelOpen = ref(true)
const sheetOpen = ref(false)
const splitter = useTemplateRef<{ panelsRef: { collapse: () => void, expand: () => void }[] }>('splitter')
const sidebarOpen = computed(() => wide.value ? panelOpen.value : sheetOpen.value)
const activeView = computed(() => sidebarOpen.value ? sidebarView.value : undefined)
// A read-only template has nothing to fill from a preset and no cursor to put an image at.
const hiddenViews = computed<SidebarView[]>(() => readOnly.value ? ['presets', 'images'] : [])

function setSidebarOpen(open: boolean) {
  if (!wide.value) {
    sheetOpen.value = open
    return
  }
  const panel = splitter.value?.panelsRef[0]
  if (open) panel?.expand()
  else panel?.collapse()
  panelOpen.value = open
}
function pickView(view: SidebarView) {
  const next = pickSidebarView({ view: sidebarView.value, open: sidebarOpen.value }, view)
  sidebarView.value = next.view
  setSidebarOpen(next.open)
}
function openView(view: SidebarView) {
  sidebarView.value = view
  setSidebarOpen(true)
}
/** On a phone the slideover covers the editor, so it closes once its job is done. */
function doneOnPhone() {
  if (!wide.value) sheetOpen.value = false
  tab.value = 'edit'
}

/** Only offered while the markup is empty; asks first when that would drop intake fields already edited. */
function applyPreset(preset: HtmlIntakePreset) {
  if (!empty.value) return
  const untouched = JSON.stringify(design.value.elements) === JSON.stringify(newHtmlSlip(design.value.htmlPreset).elements)
  if (!untouched && !window.confirm(t('studio.html.replacePreset'))) return
  change({ ...newHtmlSlip(preset), width: design.value.width, height: design.value.height, paper: design.value.paper })
  doneOnPhone()
}

// --- Insert image (D41): a library image at the cursor ---

const codeEditor = useTemplateRef<{ insert: (text: string) => void, format: () => void }>('codeEditor')
function insertImage(image: ImageSummary) {
  codeEditor.value?.insert(`<img src="image:${image.id}" class="w-24">`)
  doneOnPhone()
}

// --- AI: the answer replaces the markup (v1) ---

const reviewNotes = ref<string[]>([])
function importAnswer(answer: AiAnswer) {
  reviewNotes.value = answer.reviewNotes ?? []
  if (!draft && !newName.value) newName.value = answer.name
  change({ ...design.value, html: answer.html })
  doneOnPhone()
}

// --- Preview: the server's SVG, with a sample order ---

const sample = shallowRef<{ sample: Sample } | { sample: 'custom', custom: CustomSample }>({ sample: 'typical' })
const sampleItems = computed<{ value: Sample | 'custom', label: string }[]>(() =>
  SAMPLES.map(value => ({ value, label: t(`studio.html.samples.${value}`) })),
)
const customSample = shallowRef<CustomSample>()
const presetSample = computed<Sample | 'custom'>({
  get: () => sample.value.sample,
  set: (value) => {
    if (value !== 'custom' && value !== sample.value.sample) sample.value = { sample: value }
  },
})

function applyCustomSample(custom: CustomSample) {
  customSample.value = custom
  sample.value = { sample: 'custom', custom }
}

function sampleRequest(design: SlipDesign) {
  const selected = sample.value
  if (selected.sample !== 'custom') return selected
  // Rename, removal or a preset change can make an old sample value incompatible.
  const { custom } = selected
  const problems = customSampleFieldProblems(design, custom.values)
  const values = Object.fromEntries(Object.entries(custom.values).filter(([key]) => !Object.hasOwn(problems, key)))
  return { sample: selected.sample, custom: { ...custom, values } }
}
const previewInput = computed(() => empty.value || check.value.problems.length
  ? undefined
  : { design: design.value, ...sampleRequest(design.value) })
const { preview, previewError, previewCurrent, previewLoading, previewUpdating, loadPreview } = useHtmlTemplatePreview({
  input: () => previewInput.value,
  renderImmediatelyOn: () => sample.value,
  clearImageWhen: () => empty.value,
})
const previewRatio = computed(() => {
  const { width, height } = preview.value ?? design.value
  return width / height
})
const {
  zoom, pannable, dragging, canZoomIn, canZoomOut, fit, zoomIn, zoomOut,
  onWheel, startPan, movePan, endPan,
} = useHtmlPreviewViewport()

// --- Sample print: keep the selected SVG and paper size available until the dialog closes. ---

const samplePrint = shallowRef<{ url: string, paper: Paper }>()
const printSampleSlip = useTemplateRef<HTMLElement>('printSampleSlip')
const printingSample = ref(false)
const printSlip = useSlipPrint(() => samplePrint.value?.paper ?? design.value.paper)

function clearSamplePrint() {
  if (!samplePrint.value) return
  URL.revokeObjectURL(samplePrint.value.url)
  samplePrint.value = undefined
}

async function printSample() {
  const paper = design.value.paper
  if (!previewCurrent.value || !preview.value || !paper || printingSample.value) return
  clearSamplePrint()
  printingSample.value = true
  try {
    samplePrint.value = { url: URL.createObjectURL(preview.value.blob), paper }
    await nextTick()
    if (printSampleSlip.value) await printSlip(printSampleSlip.value)
  }
  catch {
    clearSamplePrint()
    toast.add({ title: t('studio.html.printSampleFailed'), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    printingSample.value = false
  }
}

onMounted(() => window.addEventListener('afterprint', clearSamplePrint))
onBeforeUnmount(() => {
  window.removeEventListener('afterprint', clearSamplePrint)
  clearSamplePrint()
})

// --- Publish, shops ---

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

// --- Layout: sidebar, editor and preview in one splitter from lg; on a phone the tab picks the panel shown ---

const tab = ref<'edit' | 'preview'>('edit')
const tabs = computed(() => [
  { label: t('studio.html.tabs.edit'), value: 'edit' },
  { label: t('studio.html.tabs.preview'), value: 'preview' },
])
// The sidebar is sized in pixels so the editor and preview take the change when the window resizes.
// Below lg the active panel takes the whole row (beating the splitter's inline flex) and the others hide.
const panels = computed(() => [
  { id: 'html-studio-sidebar-panel', slot: 'sidebar', sizeUnit: 'px' as const, defaultSize: 300, minSize: 220, maxSize: 520, collapsible: true, collapsedSize: 0, class: 'max-lg:hidden' },
  ...(['edit', 'preview'] as const).map(value => ({
    id: `html-studio-${value}`,
    slot: value,
    minSize: 20,
    class: tab.value === value ? 'max-lg:flex-[1_1_100%]!' : 'max-lg:hidden',
  })),
])
</script>

<template>
  <div
    class="flex h-dvh flex-col bg-default"
    :class="{ 'print:hidden': samplePrint }"
  >
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
        <UColorModeButton />
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
          :disabled="!newName.trim() || empty || readOnly"
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
      class="mx-3 mt-3 w-auto"
      color="error"
      :title="errorText(createError, t, te)"
    />

    <div class="flex min-h-0 flex-1">
      <HtmlActivityBar
        :active="activeView"
        :hidden="hiddenViews"
        @pick="pickView"
      />

      <div class="flex min-w-0 flex-1 flex-col">
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
          ref="splitter"
          auto-save-id="html-studio-sidebar"
          :items="panels"
          class="min-h-0 flex-1"
          :ui="{ handle: 'w-px max-lg:hidden' }"
          @collapse="index => index === 0 && (panelOpen = false)"
          @expand="index => index === 0 && (panelOpen = true)"
        >
          <template #resize-handle>
            <span
              class="absolute inset-0 bg-accented"
              aria-hidden="true"
            />
            <span
              class="absolute inset-y-0 -inset-x-px bg-primary opacity-0 transition-opacity group-hover:opacity-100 group-data-[resize-handle-state=drag]:opacity-100"
              aria-hidden="true"
            />
          </template>

          <!-- Sidebar: the view the activity bar picked. -->
          <template #sidebar="{ collapsed }">
            <HtmlStudioSidebar
              v-if="wide && !collapsed"
              :view="sidebarView"
              :design="design"
              :read-only="readOnly"
              :empty="empty"
              @change="change"
              @preset="applyPreset"
              @image="insertImage"
              @import="importAnswer"
              @close="setSidebarOpen(false)"
            />
          </template>

          <!-- HTML: the editor filling the panel, and its problems. -->
          <template #edit>
            <section class="flex min-w-0 flex-1 flex-col overflow-hidden bg-default">
              <!-- One editor tab, as in VS Code: the slip's markup is a single file. -->
              <div class="flex items-stretch border-b border-default bg-elevated/25">
                <div class="flex items-center gap-2 border-e border-t-2 border-default border-t-primary bg-default px-4 py-2">
                  <UIcon
                    name="i-lucide-file-code-2"
                    class="size-4 shrink-0 text-primary"
                  />
                  <h2 class="text-sm font-medium text-highlighted">
                    {{ t('studio.html.fileName') }}
                  </h2>
                </div>
                <!-- Editor actions sit at the tab strip's end, as in VS Code. -->
                <div class="ms-auto flex items-center px-2">
                  <UTooltip
                    :text="t('studio.html.formatShortcut')"
                    :kbds="['shift', 'alt', 'F']"
                  >
                    <UButton
                      icon="i-lucide-align-left"
                      :label="t('studio.html.format')"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      :disabled="readOnly || empty"
                      data-testid="html-format"
                      @click="codeEditor?.format()"
                    />
                  </UTooltip>
                </div>
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
              <div class="relative min-h-0 flex-1">
                <ClientOnly>
                  <HtmlCodeEditor
                    ref="codeEditor"
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
                <!-- Clicks pass through to the editor so the author can just start typing. -->
                <div
                  v-if="empty"
                  class="pointer-events-none absolute inset-0 flex items-center justify-center p-6"
                  data-testid="html-empty"
                >
                  <div class="flex max-w-sm flex-col items-center gap-3 text-center">
                    <UIcon
                      name="i-lucide-file-code-2"
                      class="size-10 text-dimmed"
                    />
                    <h3 class="font-semibold text-highlighted">
                      {{ t('studio.html.empty.title') }}
                    </h3>
                    <p class="text-sm text-muted">
                      {{ t(readOnly ? 'studio.html.empty.readOnly' : 'studio.html.empty.description') }}
                    </p>
                    <div
                      v-if="!readOnly"
                      class="pointer-events-auto flex flex-wrap justify-center gap-2"
                    >
                      <UButton
                        :label="t('studio.html.empty.usePreset')"
                        icon="i-lucide-layout-template"
                        @click="openView('presets')"
                      />
                      <UButton
                        :label="t('studio.html.empty.useAi')"
                        icon="i-lucide-sparkles"
                        color="neutral"
                        variant="outline"
                        @click="openView('ai')"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <!-- Problems, as VS Code's panel under the editor. -->
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
                  v-else-if="empty"
                  class="flex items-center gap-2 text-sm text-muted"
                >
                  <UIcon
                    name="i-lucide-circle-dashed"
                    class="size-5"
                  />
                  {{ t(draft ? 'studio.html.emptyStatus' : 'studio.html.emptyStatusNew') }}
                </p>
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

          <!-- Preview: samples, zoom, print and download over a dotted canvas. -->
          <template #preview>
            <section class="flex min-w-0 flex-1 flex-col overflow-hidden bg-default">
              <div class="flex flex-wrap items-center gap-2 border-b border-default px-4 py-2">
                <h2 class="me-auto text-sm font-semibold text-highlighted">
                  {{ t('studio.html.tabs.preview') }}
                </h2>
                <URadioGroup
                  v-model="presetSample"
                  :items="sampleItems"
                  variant="table"
                  orientation="horizontal"
                  size="sm"
                  indicator="hidden"
                  :legend="t('studio.html.sample')"
                  :ui="{ fieldset: 'flex-nowrap', legend: 'sr-only', item: 'h-8 items-center px-2.5 py-0', wrapper: 'ms-0', label: 'leading-none' }"
                />
                <HtmlCustomSampleModal
                  :design="design"
                  :custom="customSample"
                  :can-preview="!empty && !check.problems.length"
                  @apply="applyCustomSample"
                >
                  <UButton
                    :label="t('studio.html.customSample.button')"
                    :aria-label="sample.sample === 'custom' ? t('studio.html.customSample.edit') : undefined"
                    color="neutral"
                    :variant="sample.sample === 'custom' ? 'soft' : 'outline'"
                    size="sm"
                    :disabled="empty"
                  />
                </HtmlCustomSampleModal>
                <UFieldGroup size="sm">
                  <UButton
                    :label="t('studio.canvas.fit')"
                    color="neutral"
                    variant="outline"
                    :disabled="!preview"
                    @click="fit"
                  />
                  <UButton
                    icon="i-lucide-minus"
                    color="neutral"
                    variant="outline"
                    :aria-label="t('studio.html.zoomOut')"
                    :disabled="!preview || !canZoomOut"
                    @click="zoomOut"
                  />
                  <UButton
                    icon="i-lucide-plus"
                    color="neutral"
                    variant="outline"
                    :aria-label="t('studio.html.zoomIn')"
                    :disabled="!preview || !canZoomIn"
                    @click="zoomIn"
                  />
                </UFieldGroup>
                <UButton
                  v-if="preview && design.paper"
                  :label="t('studio.html.printSample')"
                  :disabled="!previewCurrent"
                  :loading="printingSample"
                  icon="i-lucide-printer"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  @click="printSample"
                />
                <UButton
                  v-if="preview"
                  :label="t('studio.html.downloadSvg')"
                  :to="previewCurrent ? preview.url : undefined"
                  :disabled="!previewCurrent"
                  external
                  download="laundry-slip.svg"
                  icon="i-lucide-download"
                  color="neutral"
                  variant="outline"
                  size="sm"
                />
              </div>
              <div class="@container-size relative min-h-0 flex-1 bg-muted bg-[radial-gradient(var(--ui-border-accented)_1px,transparent_1px)] bg-size-[16px_16px]">
                <div
                  ref="previewViewport"
                  class="preview-viewport absolute inset-0 overflow-auto overscroll-contain scrollbar-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                  :class="dragging ? 'cursor-grabbing' : pannable ? 'cursor-grab' : undefined"
                  role="region"
                  :aria-label="t('studio.html.tabs.preview')"
                  :aria-describedby="preview ? 'html-preview-keys' : undefined"
                  :tabindex="preview ? 0 : undefined"
                  data-testid="html-preview-viewport"
                  @wheel="onWheel"
                  @pointerdown="startPan"
                  @pointermove="movePan"
                  @lostpointercapture="endPan"
                >
                  <div
                    class="flex min-h-full min-w-full items-center justify-center p-6"
                    :class="{ 'w-max': preview }"
                    :style="{ '--preview-ratio': previewRatio }"
                  >
                    <img
                      v-if="preview"
                      ref="previewImage"
                      :src="preview.url"
                      :alt="t('studio.html.previewAlt')"
                      :width="preview.width"
                      :height="preview.height"
                      draggable="false"
                      :style="{ '--preview-zoom': zoom / 100 }"
                      class="preview-paper block h-auto max-w-none shrink-0 bg-white shadow-sm select-none motion-safe:transition-[width] motion-safe:ease-out"
                      data-testid="html-preview"
                    >
                    <USkeleton
                      v-else-if="previewLoading"
                      class="preview-paper shrink-0"
                      :style="{ aspectRatio: previewRatio }"
                      role="status"
                      aria-busy="true"
                      :aria-label="t('studio.html.previewUpdating')"
                    />
                    <p
                      v-else-if="!previewError"
                      class="text-sm text-muted"
                      data-testid="html-preview-placeholder"
                    >
                      {{ t(empty ? 'studio.html.previewEmpty' : 'studio.html.previewInvalid') }}
                    </p>
                  </div>
                </div>
              </div>
              <PageLoadError
                v-if="previewError"
                class="border-t border-default p-3"
                :error="previewError"
                :loading="previewLoading"
                @retry="loadPreview"
              />
              <div class="flex items-center gap-x-4 border-t border-default px-4 py-2.5 text-sm text-muted">
                <div class="min-w-0 flex-1">
                  <span
                    v-if="preview && (previewLoading ? previewUpdating : !previewCurrent)"
                    role="status"
                    class="block truncate text-xs leading-5"
                    :class="previewLoading ? 'text-muted' : 'text-warning'"
                  >
                    {{ t(previewLoading ? 'studio.html.previewUpdating' : 'studio.html.previewStale') }}
                  </span>
                  <div
                    v-else
                    class="flex items-center gap-x-4"
                  >
                    <span
                      v-if="design.paper"
                      class="shrink-0"
                    >{{ design.paper.widthMm }} × {{ design.paper.heightMm }} mm</span>
                    <span
                      v-if="preview"
                      class="hidden truncate lg:pointer-fine:block"
                    >{{ t('studio.html.previewMouseHint') }}</span>
                  </div>
                </div>
                <span
                  v-if="preview"
                  id="html-preview-keys"
                  class="sr-only"
                >{{ t('studio.html.previewKeyboardHint') }}</span>
                <div class="flex shrink-0 gap-x-4 tabular-nums">
                  <span v-if="preview">
                    <span class="sr-only">{{ t('studio.canvas.zoom') }}</span>
                    {{ t('studio.html.zoomPercent', { percent: Math.round(zoom) }) }}
                  </span>
                  <span>{{ design.width }} × {{ design.height }} px</span>
                </div>
              </div>
            </section>
          </template>
        </USplitter>
      </div>
    </div>

    <!-- On a phone the sidebar is a slideover from the left, over the editor. -->
    <USlideover
      v-if="!wide"
      v-model:open="sheetOpen"
      side="left"
      :title="t(`studio.html.sidebar.views.${sidebarView}`)"
    >
      <template #content>
        <HtmlStudioSidebar
          :view="sidebarView"
          :design="design"
          :read-only="readOnly"
          :empty="empty"
          @change="change"
          @preset="applyPreset"
          @image="insertImage"
          @import="importAnswer"
          @close="sheetOpen = false"
        />
      </template>
    </USlideover>

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
    <Teleport to="body">
      <div
        v-if="samplePrint"
        ref="printSampleSlip"
        class="print-slip hidden bg-white print:block"
        aria-hidden="true"
        data-testid="html-print-sample"
      >
        <img
          :src="samplePrint.url"
          alt=""
          class="block size-full"
        >
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.preview-viewport {
  /* The wheel handler keeps its own anchor while zooming. */
  overflow-anchor: none;
}

.preview-paper {
  /* Allow the p-6 gutter on both edges, even when height is what limits Fit. */
  --preview-gutters: calc(var(--spacing) * 12);
  --preview-fit-width: min(100cqw - var(--preview-gutters), (100cqh - var(--preview-gutters)) * var(--preview-ratio));
  width: calc(max(0px, var(--preview-fit-width)) * var(--preview-zoom, 1));
}
</style>
