<script setup lang="ts">
/**
 * The studio (plan §5, D35; desktop only, platform only): one template's artwork with its form
 * fields on a grey workspace, saved by itself, with undo and redo, Try it, Preview (the server's
 * PNG), Replace artwork and Publish. English only (D33).
 */
import { PAPER_MAX_MM, PAPER_MIN_MM } from '#shared/contracts/slip-design'
import type { ImageSummary, TemplateDetail } from '#shared/contracts/templates'
import { sampleData, SAMPLE_SHOP } from '#shared/slip/fields'
import type { SlipData } from '#shared/contracts/slip-design'
import { publishProblems } from '#shared/slip/checks'
import { emptyFill, fillData, SlipFiller, SlipSvg, useSlipText } from '~/features/slip-fill'
import type { SlipFill } from '#shared/slip/values'
import { useStudioEditor } from '../composables/useStudioEditor'
import { useTemplateDraft } from '../composables/useTemplateDraft'
import { useWideScreen } from '../composables/useWideScreen'
import { fieldName } from '../utils/field-name'
import ArtworkPicker from './ArtworkPicker.vue'
import ElementToolbar from './ElementToolbar.vue'
import FormPanel from './FormPanel.vue'
import StudioCanvas from './StudioCanvas.vue'

const props = defineProps<{ template: TemplateDetail }>()

const { t, te } = useI18n()
const toast = useToast()
const wide = useWideScreen()
const { text, failed: fontsFailed, reload: reloadFonts } = useSlipText()
const fontError = new ApiError({ kind: 'network', status: 0 })
const draft = useTemplateDraft(props.template)
const editor = useStudioEditor(props.template.design, draft)
const { status, saved } = draft
const design = editor.design

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

// --- Archive (step 2); a shop's slips are attached on its page ---

const archiveOpen = ref(false)
const moreItems = computed(() => [[
  { label: t('studio.artwork.replace'), icon: 'i-lucide-image-up', onSelect: openReplace },
  { label: t('studio.paper.menu'), icon: 'i-lucide-ruler', onSelect: openPaper },
], [saved.value.status === 'archived'
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

// --- Paper size (D39): millimetres for printing, kept with each published version ---

const paperOpen = ref(false)
const paperWidth = ref<number | null>(null)
const paperHeight = ref<number | null>(null)
function openPaper() {
  paperWidth.value = design.value.paper?.widthMm ?? null
  paperHeight.value = design.value.paper?.heightMm ?? null
  paperOpen.value = true
}
/** The height that keeps the artwork's proportions for a width. */
function proportionalHeight(width: number) {
  return Math.round(width * design.value.height / design.value.width * 10) / 10
}
const paperValid = computed(() => [paperWidth.value, paperHeight.value].every(side => typeof side === 'number' && side >= PAPER_MIN_MM && side <= PAPER_MAX_MM))
function applyPaper() {
  if (!paperValid.value) return
  editor.apply({ ...design.value, paper: { widthMm: paperWidth.value!, heightMm: paperHeight.value! } })
  paperOpen.value = false
}

// --- Replace the artwork (plan §5.2): the canvas takes its size; the fields stay where they are ---

const replaceOpen = ref(false)
const replacement = shallowRef<ImageSummary>()
function openReplace() {
  replacement.value = undefined
  replaceOpen.value = true
}
function applyReplace() {
  const image = replacement.value
  if (!image) return
  editor.apply({ ...design.value, width: image.width, height: image.height, background: { ...design.value.background, imageId: image.id } })
  replaceOpen.value = false
  void nextTick(() => canvas.value?.fit())
}

// --- Try it (plan §5.3.4): the owner's form in a phone-sized frame; nothing is saved ---

const tryOpen = ref(false)
const tryFill = ref<SlipFill>(emptyFill())
const tryChecked = ref(false)
const filler = ref<InstanceType<typeof SlipFiller>>()
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
/** The publish checks (plan §5.6): the server refuses the same errors. */
const problems = computed(() => publishProblems(design.value))

function problemName(key: string | undefined): string {
  if (!key) return ''
  const group = design.value.groups.find(item => item.id === key)
  if (group) return group.label || t('studio.form.types.choice')
  const element = editor.element(key)
  return element ? fieldName(element, t) : key
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
      <aside class="w-72 shrink-0 overflow-y-auto border-e border-default p-3">
        <FormPanel :editor="editor" />
      </aside>
      <div class="flex min-w-0 flex-1 flex-col">
        <ElementToolbar :editor="editor" />
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
      v-model:open="replaceOpen"
      :title="t('studio.artwork.replaceTitle')"
      :description="t('studio.artwork.replaceDescription')"
    >
      <template #body>
        <ArtworkPicker v-model="replacement" />
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            :label="t('common.actions.cancel')"
            color="neutral"
            variant="ghost"
            @click="replaceOpen = false"
          />
          <UButton
            :label="t('studio.artwork.replaceApply')"
            :disabled="!replacement"
            @click="applyReplace"
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
            <SlipFiller
              ref="filler"
              v-model="tryFill"
              :design="design"
              :shop="SAMPLE_SHOP"
              :text="text"
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
  <UModal
    v-model:open="paperOpen"
    :title="t('studio.paper.title')"
    :description="t('studio.paper.description')"
  >
    <template #body>
      <div class="flex flex-wrap items-end gap-3">
        <UFormField :label="t('studio.paper.width')">
          <UInputNumber
            v-model="paperWidth"
            :min="PAPER_MIN_MM"
            :max="PAPER_MAX_MM"
            :step="1"
            :step-snapping="false"
            :format-options="{ maximumFractionDigits: 1 }"
            data-testid="paper-width"
          />
        </UFormField>
        <UFormField :label="t('studio.paper.height')">
          <UInputNumber
            v-model="paperHeight"
            :min="PAPER_MIN_MM"
            :max="PAPER_MAX_MM"
            :step="1"
            :step-snapping="false"
            :format-options="{ maximumFractionDigits: 1 }"
            data-testid="paper-height"
          />
        </UFormField>
        <UButton
          :label="t('studio.paper.proportional')"
          color="neutral"
          variant="outline"
          :disabled="!paperWidth"
          @click="paperHeight = proportionalHeight(paperWidth!)"
        />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          :label="t('common.actions.cancel')"
          color="neutral"
          variant="ghost"
          @click="paperOpen = false"
        />
        <UButton
          :label="t('studio.paper.apply')"
          :disabled="!paperValid"
          data-testid="paper-apply"
          @click="applyPaper"
        />
      </div>
    </template>
  </UModal>
</template>
