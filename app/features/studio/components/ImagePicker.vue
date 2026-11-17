<script setup lang="ts">
/**
 * The platform's uploaded images (plan §5.3 → Uploads, §5.9): upload one, or choose one. Shared by
 * every template; each shows its size.
 */
import type { Page } from '#shared/contracts/common'
import type { ImageSummary } from '#shared/contracts/templates'
import { IMAGE_MAX_BYTES } from '#shared/contracts/templates'

defineProps<{ chooseLabel: string }>()
const emit = defineEmits<{ choose: [image: ImageSummary] }>()
const { t, te } = useI18n()

const page = ref(1)
const images = useApiQuery(() => `studio:images:${page.value}`, () => apiFetch<Page<ImageSummary>>('/platform/images', { query: { page: page.value, pageSize: 24 } }), { watch: [page] })
const uploadError = ref<string>()
const upload = useMutation((file: File) => apiFetch<ImageSummary>('/platform/images', { method: 'POST', query: { name: file.name }, body: file, headers: { 'content-type': file.type || 'application/octet-stream' } }), { inline: true, invalidate: ['studio'] })

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  uploadError.value = undefined
  if (file.size > IMAGE_MAX_BYTES) {
    uploadError.value = t('studio.new.photoTooLarge')
    return
  }
  const result = await upload.execute(file)
  if (result.ok) emit('choose', result.data)
  else uploadError.value = errorText(result.error, t, te)
}
</script>

<template>
  <div class="space-y-3">
    <label class="block">
      <span class="mb-1 block text-xs text-muted">{{ t('studio.uploads.upload') }}</span>
      <input
        type="file"
        accept="image/png,image/jpeg"
        class="block w-full text-sm file:me-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-inverted"
        :disabled="upload.pending.value"
        data-testid="upload-input"
        @change="onFile"
      >
    </label>
    <p
      v-if="uploadError"
      class="text-sm text-error"
      role="alert"
    >
      {{ uploadError }}
    </p>
    <USkeleton
      v-if="images.loading.value"
      class="h-24 w-full"
    />
    <p
      v-else-if="!images.data.value?.items.length"
      class="text-sm text-muted"
    >
      {{ t('studio.uploads.empty') }}
    </p>
    <ul
      v-else
      class="grid grid-cols-2 gap-2"
    >
      <li
        v-for="image in images.data.value.items"
        :key="image.id"
      >
        <button
          type="button"
          class="group w-full rounded-md border border-default p-1 text-left hover:border-primary"
          :aria-label="`${chooseLabel}: ${image.name}`"
          @click="emit('choose', image)"
        >
          <img
            :src="`/api/platform/images/${image.id}`"
            alt=""
            loading="lazy"
            class="aspect-square w-full rounded bg-elevated object-contain"
          >
          <span class="mt-1 block truncate text-xs">{{ image.name }}</span>
          <span class="block text-xs text-muted tabular-nums">{{ image.width }} × {{ image.height }}</span>
        </button>
      </li>
    </ul>
    <UPagination
      v-if="(images.data.value?.total ?? 0) > 24"
      v-model:page="page"
      :total="images.data.value?.total ?? 0"
      :items-per-page="24"
      size="xs"
    />
  </div>
</template>
