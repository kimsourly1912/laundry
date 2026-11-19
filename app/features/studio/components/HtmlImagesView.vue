<script setup lang="ts">
/**
 * The Studio sidebar's Images view (D41): the platform's image library, and Upload for a PNG, JPEG,
 * or an SVG the browser turns into a PNG, as artwork is (`prepareArtwork`). Choosing an image, or
 * uploading one, hands it back; the page writes `<img src="image:<id>">` at the cursor.
 */
import type { Page } from '#shared/contracts/common'
import type { ImageSummary } from '#shared/contracts/templates'
import { ArtworkError, prepareArtwork } from '../utils/artwork'

const emit = defineEmits<{ chosen: [image: ImageSummary] }>()
const { t, te } = useI18n()

const library = useApiQuery('studio:images', () => apiFetch<Page<ImageSummary>>('/platform/images', { query: { pageSize: 100 } }), { immediate: false })
onMounted(() => library.refresh())

const upload = useMutation((file: File) => apiFetch<ImageSummary>('/platform/images', { method: 'POST', query: { name: file.name }, body: file, headers: { 'content-type': file.type } }), { inline: true, invalidate: ['studio:images'] })
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const problem = ref<string>()
const preparing = ref(false)

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  problem.value = undefined
  preparing.value = true
  try {
    const ready = await prepareArtwork(file)
    const result = await upload.execute(new File([ready.file], file.name, { type: ready.file.type }))
    if (result.ok) emit('chosen', result.data)
    else problem.value = errorText(result.error, t, te)
  }
  catch (error) {
    problem.value = error instanceof ArtworkError ? t(`studio.artwork.problems.${error.problem}`) : t('studio.artwork.problems.unreadable')
  }
  finally {
    preparing.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <p class="text-sm text-muted">
      {{ t('studio.html.images.description') }}
    </p>
    <div class="space-y-2">
      <UButton
        :label="t('studio.html.images.upload')"
        icon="i-lucide-upload"
        color="neutral"
        variant="outline"
        block
        :loading="preparing"
        @click="fileInput?.click()"
      />
      <input
        ref="fileInput"
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,.svg"
        class="hidden"
        :aria-label="t('studio.html.images.upload')"
        data-testid="html-image-input"
        @change="onFile"
      >
      <p class="text-xs text-muted">
        {{ t('studio.html.images.rules') }}
      </p>
      <p
        v-if="problem"
        class="text-sm text-error"
        role="alert"
      >
        {{ problem }}
      </p>
    </div>

    <USkeleton
      v-if="library.loading.value && !library.data.value"
      class="h-32 w-full"
      role="status"
      aria-busy="true"
      :aria-label="t('studio.html.images.loading')"
    />
    <p
      v-else-if="!library.data.value?.items.length"
      class="text-sm text-muted"
    >
      {{ t('studio.html.images.none') }}
    </p>
    <ul
      v-else
      class="grid grid-cols-2 gap-2 @xs:grid-cols-3"
      data-testid="html-image-library"
    >
      <li
        v-for="image in library.data.value.items"
        :key="image.id"
      >
        <UTooltip :text="`${image.name || t('studio.html.images.unnamed')} · ${t('studio.html.images.size', { width: image.width, height: image.height })}`">
          <button
            type="button"
            class="flex w-full flex-col gap-1 rounded-md border border-default bg-default p-1.5 text-start hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
            :aria-label="t('studio.html.images.use', { name: image.name || t('studio.html.images.unnamed') })"
            @click="emit('chosen', image)"
          >
            <img
              :src="`/api/platform/images/${image.id}`"
              alt=""
              loading="lazy"
              class="aspect-square w-full rounded-sm bg-white object-contain"
            >
            <span class="truncate text-xs text-muted">{{ image.name || t('studio.html.images.unnamed') }}</span>
          </button>
        </UTooltip>
      </li>
    </ul>
  </div>
</template>
