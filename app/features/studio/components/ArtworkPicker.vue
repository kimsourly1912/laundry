<script setup lang="ts">
/**
 * Uploads a slip's artwork (plan §5.2, D35): PNG, JPEG or SVG, prepared in the browser
 * (`prepareArtwork`), then stored as an image. Shows what will be used, and what the browser
 * changed, before the platform goes on.
 */
import type { ImageSummary } from '#shared/contracts/templates'
import { IMAGE_SOFT_SIDE } from '#shared/contracts/templates'
import { ArtworkError, prepareArtwork } from '../utils/artwork'
import type { PreparedArtwork } from '../utils/artwork'

const artwork = defineModel<ImageSummary | undefined>({ required: true })
const emit = defineEmits<{ chosen: [file: File] }>()

const { t, te } = useI18n()
const prepared = shallowRef<PreparedArtwork>()
const previewUrl = ref<string>()
const problem = ref<string>()
const preparing = ref(false)

const upload = useMutation((file: Blob) => apiFetch<ImageSummary>('/platform/images', { method: 'POST', query: { name: 'artwork' }, body: file, headers: { 'content-type': file.type } }), { inline: true })

function clearPreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = undefined
}

async function choose(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  problem.value = undefined
  artwork.value = undefined
  prepared.value = undefined
  clearPreview()
  preparing.value = true
  try {
    const ready = await prepareArtwork(file)
    const result = await upload.execute(ready.file)
    if (!result.ok) {
      problem.value = errorText(result.error, t, te)
      return
    }
    prepared.value = ready
    previewUrl.value = URL.createObjectURL(ready.file)
    artwork.value = result.data
    emit('chosen', file)
  }
  catch (error) {
    problem.value = error instanceof ArtworkError ? t(`studio.artwork.problems.${error.problem}`) : t('studio.artwork.problems.unreadable')
  }
  finally {
    preparing.value = false
  }
}

const soft = computed(() => artwork.value && Math.max(artwork.value.width, artwork.value.height) < IMAGE_SOFT_SIDE)
onBeforeUnmount(clearPreview)
</script>

<template>
  <div class="space-y-2">
    <label class="block">
      <span class="sr-only">{{ t('studio.artwork.choose') }}</span>
      <input
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,.svg"
        class="block w-full text-sm file:me-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-inverted"
        :disabled="preparing"
        data-testid="artwork-input"
        @change="choose"
      >
    </label>
    <p class="text-xs text-muted">
      {{ t('studio.artwork.rules') }}
    </p>
    <p
      v-if="preparing"
      class="text-sm text-muted"
    >
      {{ t('studio.artwork.preparing') }}
    </p>
    <div
      v-if="artwork && previewUrl"
      class="space-y-2"
    >
      <img
        :src="previewUrl"
        :alt="t('studio.artwork.previewAlt')"
        class="max-h-64 w-auto max-w-full border border-default bg-white"
        data-testid="artwork-preview"
      >
      <p class="text-sm">
        {{ t('studio.artwork.ready', { width: artwork.width, height: artwork.height }) }}
      </p>
      <ul
        v-if="prepared?.changes.length"
        class="list-disc ps-4 text-xs text-muted"
      >
        <li
          v-for="change in prepared.changes"
          :key="change"
        >
          {{ t(`studio.artwork.changes.${change}`) }}
        </li>
      </ul>
    </div>
    <UAlert
      v-if="soft"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="t('studio.artwork.soft', { side: IMAGE_SOFT_SIDE })"
    />
    <p
      v-if="problem"
      class="text-sm text-error"
      role="alert"
    >
      {{ problem }}
    </p>
  </div>
</template>
