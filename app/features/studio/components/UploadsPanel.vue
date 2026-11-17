<script setup lang="ts">
/**
 * The Uploads tab (plan §5.3): click an image to add it (in proportion, at most half the canvas), or
 * make it the background. A background is never selectable on the canvas.
 */
import type { ImageSummary } from '#shared/contracts/templates'
import { createElement, newKey } from '#shared/slip/elements'
import type { StudioEditor } from '../composables/useStudioEditor'
import { addElements, placedSize } from '../utils/design-ops'
import ImagePicker from './ImagePicker.vue'

const props = defineProps<{ editor: StudioEditor }>()
const { t } = useI18n()
const { editor } = props
const mode = ref<'add' | 'background'>('add')
const modes = computed(() => [{ value: 'add', label: t('studio.uploads.add') }, { value: 'background', label: t('studio.uploads.setBackground') }])

function choose(image: ImageSummary) {
  const design = editor.design.value
  if (mode.value === 'background') {
    editor.apply({ ...design, background: { ...design.background, imageId: image.id } })
    return
  }
  const element = createElement('image', { id: newKey(), name: image.name.slice(0, 60), ...placedSize(image, design) }, { imageId: image.id })
  editor.apply(addElements(design, [element]))
  editor.select([element.id])
}
</script>

<template>
  <div class="space-y-3">
    <h2 class="px-1 text-sm font-semibold">
      {{ t('studio.tabs.uploads') }}
    </h2>
    <URadioGroup
      v-model="mode"
      :items="modes"
      orientation="horizontal"
      size="sm"
    />
    <UButton
      v-if="editor.design.value.background.imageId"
      :label="t('studio.uploads.removeBackground')"
      icon="i-lucide-image-off"
      size="xs"
      color="neutral"
      variant="outline"
      @click="editor.apply({ ...editor.design.value, background: { ...editor.design.value.background, imageId: null } })"
    />
    <ImagePicker
      :choose-label="mode === 'add' ? t('studio.uploads.add') : t('studio.uploads.setBackground')"
      @choose="choose"
    />
  </div>
</template>
