<script setup lang="ts">
/**
 * The studio (plan §5, desktop only, platform only): one template's draft on a grey workspace, saved
 * by itself, with Preview (the server's PNG) and Publish. English only (D33). S1 draws the slip;
 * the canvas's editing (S2), the form fields (S3) and the drawing tools (S4) build on this page.
 */
import type { TemplateDetail } from '#shared/contracts/templates'
import { sampleData } from '#shared/slip/fields'
import { useSlipText } from '../composables/useSlipText'
import { useTemplateDraft } from '../composables/useTemplateDraft'
import { useWideScreen } from '../composables/useWideScreen'
import SlipSvg from './SlipSvg.vue'

const props = defineProps<{ template: TemplateDetail }>()

const { t, te } = useI18n()
const toast = useToast()
const wide = useWideScreen()
const { text, failed: fontsFailed, reload: reloadFonts } = useSlipText()
const fontError = new ApiError({ kind: 'network', status: 0 })
const draft = useTemplateDraft(props.template)
const { design, status, saved } = draft

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

// --- The canvas at Fit (zoom and pan come with S2) ---

const workspace = ref<HTMLElement>()
const area = reactive({ width: 0, height: 0 })
let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    area.width = entry!.contentRect.width
    area.height = entry!.contentRect.height
  })
  if (workspace.value) observer.observe(workspace.value)
})
onBeforeUnmount(() => observer?.disconnect())

/** The slip fills the workspace less a margin, never above 100%. */
const zoom = computed(() => {
  const margin = 48
  if (!area.width || !area.height) return 1
  return Math.min(1, (area.width - margin * 2) / design.value.width, (area.height - margin * 2) / design.value.height)
})

/** The studio draws the slip with sample values, so fields show where their values go. */
const today = new Date().toISOString().slice(0, 10)
const data = computed(() => sampleData(design.value, { date: today }))

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

// --- Publish ---

const publishOpen = ref(false)
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
          :label="t('studio.preview.open')"
          icon="i-lucide-eye"
          color="neutral"
          variant="outline"
          @click="openPreview"
        />
        <UButton
          :label="t('studio.publish.open')"
          icon="i-lucide-upload"
          :disabled="!canPublish"
          @click="publishOpen = true"
        />
      </div>
    </header>

    <UAlert
      v-if="status === 'conflict'"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="t('studio.save.conflictMessage')"
      :actions="[{ label: t('common.actions.reload'), color: 'warning', variant: 'solid', onClick: () => reloadNuxtApp() }]"
      class="rounded-none"
    />

    <main
      ref="workspace"
      class="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-elevated"
    >
      <PageLoadError
        v-if="fontsFailed"
        :error="fontError"
        @retry="reloadFonts()"
      />
      <USkeleton
        v-else-if="!text"
        class="size-64"
      />
      <div
        v-else
        class="shrink-0 bg-white shadow-lg"
        data-testid="studio-canvas"
        :style="{ width: `${design.width * zoom}px`, height: `${design.height * zoom}px` }"
      >
        <SlipSvg
          :design="design"
          :data="data"
          :text="text"
        />
      </div>
      <span class="absolute right-4 bottom-3 text-xs text-muted">{{ design.width }} × {{ design.height }} px · {{ Math.round(zoom * 100) }}%</span>
    </main>

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
      v-model:open="publishOpen"
      :title="t('studio.publish.title', { number: nextVersion })"
      :description="t('studio.publish.description')"
      :dismissible="!publishing"
    >
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
            :label="t('studio.publish.confirm', { number: nextVersion })"
            :loading="publishing"
            @click="publish"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
