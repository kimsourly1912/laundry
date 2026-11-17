<script setup lang="ts">
/**
 * The studio (plan §5, desktop only, platform only): one template's draft on a grey workspace, saved
 * by itself, with undo and redo, Preview (the server's PNG) and Publish. English only (D33). The
 * left rail's tabs open their panels; the form fields (S3) and drawing tools (S4) add tabs.
 */
import type { TemplateDetail } from '#shared/contracts/templates'
import { sampleData, SAMPLE_SHOP } from '#shared/slip/fields'
import { CANVAS_MAX_SIDE, CANVAS_MIN_SIDE } from '#shared/contracts/slip-design'
import type { SlipData } from '#shared/contracts/slip-design'
import { publishProblems } from '#shared/slip/checks'
import { emptyFill, fillData, SlipFiller, SlipSvg, useSlipText } from '~/features/slip-fill'
import type { SlipFill } from '#shared/slip/values'
import { useStudioEditor } from '../composables/useStudioEditor'
import { useTemplateDraft } from '../composables/useTemplateDraft'
import { useWideScreen } from '../composables/useWideScreen'
import { fitTextHeights } from '../utils/design-ops'
import ElementToolbar from './ElementToolbar.vue'
import DrawingPanels from './DrawingPanels.vue'
import FormPanel from './FormPanel.vue'
import TemplateShopsModal from './TemplateShopsModal.vue'
import UploadsPanel from './UploadsPanel.vue'
import ShopInfoPanel from './ShopInfoPanel.vue'
import LayersPanel from './LayersPanel.vue'
import StudioCanvas from './StudioCanvas.vue'

const props = defineProps<{ template: TemplateDetail }>()

const { t, te } = useI18n()
const toast = useToast()
const wide = useWideScreen()
const { text, failed: fontsFailed, reload: reloadFonts } = useSlipText()
const fontError = new ApiError({ kind: 'network', status: 0 })
// Text boxes keep their height fitted to their text (plan §5.6) once the fonts are in.
watch(text, (shaper) => {
  if (shaper) editor.setNormalize(next => fitTextHeights(next, shaper))
}, { immediate: true })
const draft = useTemplateDraft(props.template)
const editor = useStudioEditor(props.template.design, draft)
const { status, saved } = draft
const design = editor.design

// --- Left rail (plan §5.3): a tab opens its panel; clicking it again closes it ---

const TABS = [
  { key: 'form', icon: 'i-lucide-square-check' },
  { key: 'text', icon: 'i-lucide-type' },
  { key: 'elements', icon: 'i-lucide-shapes' },
  { key: 'shop', icon: 'i-lucide-store' },
  { key: 'uploads', icon: 'i-lucide-upload' },
  { key: 'layers', icon: 'i-lucide-layers' },
] as const
type Tab = typeof TABS[number]['key']
const tab = ref<Tab | undefined>('form')
function toggleTab(key: Tab) {
  tab.value = tab.value === key ? undefined : key
}

// --- Name ---

const renaming = ref(false)
const nameInput = ref('')
function startRename() {
  nameInput.value = draft.name.value
  renaming.value = true
}
function finishRename() {
  const next = nameInput.value.trim()
  renaming.value = false
  if (next && next !== draft.name.value) draft.rename(next)
}

/** The studio draws the slip with sample values, so fields show where their values go. */
const today = new Date().toISOString().slice(0, 10)
// The same object while the sample values stay the same: each element redraws when its data
// changes, and a commit (a new design) mostly leaves them as they were (D34).
let lastData: SlipData | undefined
const data = computed(() => {
  const next = sampleData(design.value, { date: today })
  if (!lastData || JSON.stringify(next) !== JSON.stringify(lastData)) lastData = next
  return lastData
})

// --- Preview: the server's PNG of the design on screen ---

const previewOpen = ref(false)
const previewUrl = ref<string>()
const preview = useMutation(() => apiBlob(`/platform/templates/${props.template.id}/preview`, { method: 'POST', body: { design: design.value } }))
async function openPreview() {
  previewOpen.value = true
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = undefined
  const result = await preview.execute(undefined)
  if (result.ok) previewUrl.value = URL.createObjectURL(result.data)
}
onBeforeUnmount(() => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})

const canvas = ref<InstanceType<typeof StudioCanvas>>()

// --- Shops and archive (step 2) ---

const shopsOpen = ref(false)
const archiveOpen = ref(false)
const moreItems = computed(() => [[saved.value.status === 'archived'
  ? { label: t('studio.archive.restore'), icon: 'i-lucide-archive-restore', onSelect: () => runStatus('restore') }
  : { label: t('studio.archive.archive'), icon: 'i-lucide-archive', onSelect: () => { archiveOpen.value = true } }]])
async function runStatus(action: 'archive' | 'restore') {
  archiveOpen.value = false
  try {
    await (action === 'archive' ? draft.archive() : draft.restore())
    toast.add({ title: t(action === 'archive' ? 'studio.archive.archived' : 'studio.archive.restored'), color: 'success', icon: 'i-lucide-circle-check' })
  }
  catch (error) {
    toast.add({ title: errorText(error, t, te), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}

// --- Resize the canvas (plan §5.1): 200–2000 px a side; the PNG is this size ---

const resizeOpen = ref(false)
const resizeTo = reactive({ width: 0, height: 0 })
const resizeValid = computed(() => [resizeTo.width, resizeTo.height].every(side => Number.isInteger(side) && side >= CANVAS_MIN_SIDE && side <= CANVAS_MAX_SIDE))
function openResize() {
  resizeTo.width = design.value.width
  resizeTo.height = design.value.height
  resizeOpen.value = true
}
function applyResize() {
  if (!resizeValid.value) return
  editor.apply({ ...design.value, width: resizeTo.width, height: resizeTo.height })
  resizeOpen.value = false
  void nextTick(() => canvas.value?.fit())
}

// --- Try it (plan §5.4.5): the owner's form in a phone-sized frame; nothing is saved ---

const tryOpen = ref(false)
const tryFill = ref<SlipFill>(emptyFill())
const tryLanguage = ref<'en' | 'km'>('km')
const tryChecked = ref(false)
const filler = ref<InstanceType<typeof SlipFiller>>()
const languages = [{ value: 'km', label: 'ខ្មែរ' }, { value: 'en', label: 'English' }]
function openTry() {
  tryFill.value = emptyFill()
  tryChecked.value = false
  tryOpen.value = true
}
const tryData = computed(() => fillData(tryFill.value, { shop: SAMPLE_SHOP, date: today, number: 1024 }))
function checkTry() {
  tryChecked.value = filler.value?.validate() ?? false
}

// --- Publish ---

const publishOpen = ref(false)
/** The publish checks (plan §5.8): the server refuses the same errors. */
const problems = computed(() => publishProblems(design.value))

function problemName(key: string | undefined): string {
  if (!key) return ''
  const group = design.value.groups.find(item => item.id === key)
  if (group) return group.label.en || t('studio.form.types.choice')
  return editor.element(key)?.name ?? key
}

/** Selects what a problem is about, so the platform can fix it. */
function showProblem(key: string | undefined) {
  if (!key) return
  const options = design.value.elements.filter(element => element.type === 'option' && element.group === key)
  editor.select(options.length ? options.map(element => element.id) : [key])
  publishOpen.value = false
}
const nextVersion = computed(() => (saved.value.latestVersion ?? 0) + 1)
const canPublish = computed(() => status.value === 'saved' && saved.value.hasUnpublishedChanges && saved.value.status !== 'archived')
const publishing = ref(false)
async function publish() {
  publishing.value = true
  try {
    const answer = await draft.publish()
    publishOpen.value = false
    toast.add({ title: t('studio.publish.done', { number: answer.latestVersion }), color: 'success', icon: 'i-lucide-circle-check' })
  }
  catch (error) {
    toast.add({ title: errorText(error, t, te), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    publishing.value = false
  }
}

const statusText = computed(() => t(`studio.save.${status.value}`))
</script>

<template>
  <div
    v-if="!wide"
    class="flex min-h-dvh items-center justify-center p-6"
  >
    <UEmpty
      icon="i-lucide-monitor"
      :title="t('studio.desktopOnly.title')"
      :description="t('studio.desktopOnly.description')"
      :actions="[{ label: t('studio.back'), icon: 'i-lucide-arrow-left', to: '/platform/templates', color: 'neutral', variant: 'outline' }]"
    />
  </div>

  <div
    v-else
    class="flex h-dvh flex-col bg-default"
  >
    <header class="flex h-14 shrink-0 items-center gap-3 border-b border-default px-3">
      <UButton
        :label="t('studio.back')"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        to="/platform/templates"
      />
      <USeparator
        orientation="vertical"
        class="h-6"
      />
      <UInput
        v-if="renaming"
        v-model="nameInput"
        autofocus
        :aria-label="t('studio.name')"
        class="w-72"
        @keydown.enter="finishRename"
        @keydown.esc="renaming = false"
        @blur="finishRename"
      />
      <UButton
        v-else
        :label="draft.name.value"
        trailing-icon="i-lucide-pencil"
        color="neutral"
        variant="ghost"
        class="max-w-96 truncate font-semibold"
        :aria-label="t('studio.rename', { name: draft.name.value })"
        @click="startRename"
      />
      <UBadge
        :label="t(`studio.status.${saved.status}`)"
        :color="saved.status === 'published' ? 'success' : 'neutral'"
        variant="subtle"
      />
      <USeparator
        orientation="vertical"
        class="h-6"
      />
      <UButton
        icon="i-lucide-undo-2"
        color="neutral"
        variant="ghost"
        :aria-label="t('studio.undo')"
        :disabled="!editor.canUndo.value"
        @click="editor.undo()"
      />
      <UButton
        icon="i-lucide-redo-2"
        color="neutral"
        variant="ghost"
        :aria-label="t('studio.redo')"
        :disabled="!editor.canRedo.value"
        @click="editor.redo()"
      />
      <UButton
        :label="t('studio.resize.open')"
        icon="i-lucide-scaling"
        color="neutral"
        variant="ghost"
        @click="openResize"
      />

      <div class="ms-auto flex items-center gap-2">
        <span
          class="text-sm text-muted"
          role="status"
          data-testid="save-status"
        >{{ statusText }}</span>
        <UButton
          v-if="status === 'failed'"
          :label="t('common.actions.retry')"
          size="sm"
          color="neutral"
          variant="outline"
          @click="draft.retry()"
        />
        <UButton
          :label="t('studio.tryIt.open')"
          icon="i-lucide-smartphone"
          color="neutral"
          variant="outline"
          :disabled="!text"
          @click="openTry"
        />
        <UButton
          :label="t('studio.shops.open')"
          icon="i-lucide-store"
          color="neutral"
          variant="outline"
          @click="shopsOpen = true"
        />
        <UButton
          :label="t('studio.preview.open')"
          icon="i-lucide-eye"
          color="neutral"
          variant="outline"
          @click="openPreview"
        />
        <UDropdownMenu :items="moreItems">
          <UButton
            icon="i-lucide-ellipsis-vertical"
            color="neutral"
            variant="ghost"
            :aria-label="t('studio.archive.menu')"
          />
        </UDropdownMenu>
        <UButton
          :label="t('studio.publish.open')"
          icon="i-lucide-upload"
          :disabled="!canPublish"
          @click="publishOpen = true"
        />
      </div>
    </header>

    <UAlert
      v-if="saved.status === 'archived'"
      color="neutral"
      variant="subtle"
      icon="i-lucide-archive"
      :title="t('studio.archive.banner')"
      :actions="[{ label: t('studio.archive.restore'), color: 'neutral', variant: 'outline', onClick: () => runStatus('restore') }]"
      class="rounded-none"
    />
    <UAlert
      v-if="status === 'conflict'"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="t('studio.save.conflictMessage')"
      :actions="[{ label: t('common.actions.reload'), color: 'warning', variant: 'solid', onClick: () => reloadNuxtApp() }]"
      class="rounded-none"
    />

    <div class="flex min-h-0 flex-1">
      <nav
        class="flex w-16 shrink-0 flex-col items-center gap-1 border-e border-default py-2"
        :aria-label="t('studio.rail')"
      >
        <UButton
          v-for="item in TABS"
          :key="item.key"
          :icon="item.icon"
          :label="t(`studio.tabs.${item.key}`)"
          color="neutral"
          :variant="tab === item.key ? 'soft' : 'ghost'"
          size="xs"
          class="w-14 flex-col gap-0.5 text-[11px]"
          :aria-pressed="tab === item.key"
          @click="toggleTab(item.key)"
        />
      </nav>
      <aside
        v-if="tab"
        class="w-72 shrink-0 overflow-y-auto border-e border-default p-3"
      >
        <FormPanel
          v-if="tab === 'form'"
          :editor="editor"
        />
        <ShopInfoPanel
          v-else-if="tab === 'shop'"
          :editor="editor"
        />
        <DrawingPanels
          v-else-if="tab === 'text' || tab === 'elements'"
          :editor="editor"
          :tab="tab"
        />
        <UploadsPanel
          v-else-if="tab === 'uploads'"
          :editor="editor"
        />
        <LayersPanel
          v-else-if="tab === 'layers'"
          :editor="editor"
        />
      </aside>
      <div class="flex min-w-0 flex-1 flex-col">
        <ElementToolbar
          :editor="editor"
          @edit-text="canvas?.startEditing($event)"
        />
        <PageLoadError
          v-if="fontsFailed"
          :error="fontError"
          class="m-6"
          @retry="reloadFonts()"
        />
        <div
          v-else-if="!text"
          class="flex flex-1 items-center justify-center bg-elevated"
        >
          <USkeleton class="size-64" />
        </div>
        <StudioCanvas
          v-else
          ref="canvas"
          :editor="editor"
          :data="data"
          :text="text"
        />
      </div>
    </div>

    <UModal
      v-model:open="previewOpen"
      :title="t('studio.preview.title')"
      :description="t('studio.preview.description')"
      :ui="{ content: 'max-w-4xl' }"
    >
      <template #body>
        <div class="flex min-h-48 items-center justify-center">
          <img
            v-if="previewUrl"
            :src="previewUrl"
            :alt="t('studio.preview.alt')"
            class="max-h-[70vh] max-w-full border border-default"
            data-testid="preview-image"
          >
          <USkeleton
            v-else-if="preview.pending.value"
            class="h-64 w-full"
          />
          <p
            v-else
            class="text-sm text-error"
          >
            {{ t('studio.preview.failed') }}
          </p>
        </div>
      </template>
    </UModal>

    <TemplateShopsModal
      v-model:open="shopsOpen"
      :template-id="template.id"
      :published="saved.status === 'published'"
    />

    <UModal
      v-model:open="archiveOpen"
      :title="t('studio.archive.confirmTitle')"
      :description="t('studio.archive.confirmDescription')"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            :label="t('common.actions.cancel')"
            color="neutral"
            variant="ghost"
            @click="archiveOpen = false"
          />
          <UButton
            :label="t('studio.archive.archive')"
            color="error"
            @click="runStatus('archive')"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="resizeOpen"
      :title="t('studio.resize.title')"
      :description="t('studio.resize.description')"
    >
      <template #body>
        <div class="flex gap-3">
          <UFormField
            :label="t('studio.new.width')"
            :error="resizeValid ? undefined : t('studio.new.sizeRange', { min: CANVAS_MIN_SIDE, max: CANVAS_MAX_SIDE })"
          >
            <UInputNumber
              v-model="resizeTo.width"
              :min="CANVAS_MIN_SIDE"
              :max="CANVAS_MAX_SIDE"
            />
          </UFormField>
          <UFormField :label="t('studio.new.height')">
            <UInputNumber
              v-model="resizeTo.height"
              :min="CANVAS_MIN_SIDE"
              :max="CANVAS_MAX_SIDE"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            :label="t('common.actions.cancel')"
            color="neutral"
            variant="ghost"
            @click="resizeOpen = false"
          />
          <UButton
            :label="t('studio.resize.apply')"
            :disabled="!resizeValid"
            @click="applyResize"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="tryOpen"
      :title="t('studio.tryIt.title')"
      :description="t('studio.tryIt.description')"
      :ui="{ content: 'max-w-6xl' }"
    >
      <template #body>
        <div
          v-if="text"
          class="flex items-start gap-6"
        >
          <div class="w-[390px] shrink-0 space-y-3 rounded-[2rem] border-8 border-neutral-800 bg-elevated p-3">
            <URadioGroup
              v-model="tryLanguage"
              :items="languages"
              orientation="horizontal"
              :legend="t('studio.tryIt.language')"
              size="sm"
            />
            <SlipFiller
              ref="filler"
              v-model="tryFill"
              :design="design"
              :shop="SAMPLE_SHOP"
              :text="text"
              :language="tryLanguage"
              :date="today"
            />
            <div class="flex items-center gap-2">
              <UButton
                :label="t('studio.tryIt.check')"
                @click="checkTry"
              />
              <UButton
                :label="t('studio.tryIt.reset')"
                color="neutral"
                variant="ghost"
                @click="tryFill = emptyFill(); tryChecked = false"
              />
            </div>
            <p
              v-if="tryChecked"
              class="text-sm text-success"
            >
              {{ t('studio.tryIt.checked') }}
            </p>
          </div>
          <div
            class="min-w-0 flex-1 bg-white shadow"
            :style="{ aspectRatio: `${design.width} / ${design.height}` }"
          >
            <SlipSvg
              :design="design"
              :data="tryData"
              :text="text"
              id-prefix="try-"
            />
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="publishOpen"
      :title="t('studio.publish.title', { number: nextVersion })"
      :description="t('studio.publish.description')"
      :dismissible="!publishing"
    >
      <template #body>
        <div
          class="space-y-3"
          data-testid="publish-checks"
        >
          <p
            v-if="!problems.errors.length && !problems.warnings.length"
            class="text-sm text-success"
          >
            {{ t('studio.publish.allGood') }}
          </p>
          <UAlert
            v-if="problems.errors.length"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-x"
            :title="t('studio.publish.fixFirst')"
          >
            <template #description>
              <ul class="list-disc ps-4">
                <li
                  v-for="(problem, index) in problems.errors"
                  :key="index"
                >
                  <button
                    type="button"
                    class="text-left underline-offset-2 hover:underline"
                    @click="showProblem(problem.key)"
                  >
                    {{ t(`studio.publish.errors.${problem.code}`, { name: problemName(problem.key) }) }}
                  </button>
                </li>
              </ul>
            </template>
          </UAlert>
          <UAlert
            v-if="problems.warnings.length"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :title="t('studio.publish.check')"
          >
            <template #description>
              <ul class="list-disc ps-4">
                <li
                  v-for="(problem, index) in problems.warnings"
                  :key="index"
                >
                  <button
                    type="button"
                    class="text-left underline-offset-2 hover:underline"
                    @click="showProblem(problem.key)"
                  >
                    {{ t(`studio.publish.warnings.${problem.code}`, { name: problemName(problem.key) }) }}
                  </button>
                </li>
              </ul>
            </template>
          </UAlert>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            :label="t('common.actions.cancel')"
            color="neutral"
            variant="ghost"
            :disabled="publishing"
            @click="publishOpen = false"
          />
          <UButton
            :label="problems.warnings.length ? t('studio.publish.confirmAnyway', { number: nextVersion }) : t('studio.publish.confirm', { number: nextVersion })"
            :disabled="problems.errors.length > 0"
            :loading="publishing"
            @click="publish"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
