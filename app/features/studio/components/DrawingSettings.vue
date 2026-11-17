<script setup lang="ts">
/**
 * The contextual toolbar for drawing elements (plan §5.5): text (size, bold, colour, alignment, line
 * spacing), shapes and lines (fill, border colour, width, dashed, corner radius), icons (which,
 * colour) and images (replace, set as background).
 */
import type { SlipElement } from '#shared/contracts/slip-design'
import { ALIGNS } from '#shared/contracts/slip-design'
import type { ImageSummary } from '#shared/contracts/templates'
import type { StudioEditor } from '../composables/useStudioEditor'
import { removeElements, updateElements } from '../utils/design-ops'
import ColorField from './ColorField.vue'
import ImagePicker from './ImagePicker.vue'

const props = defineProps<{ editor: StudioEditor, element: SlipElement }>()
const emit = defineEmits<{ editText: [id: string] }>()
const { t } = useI18n()
const { editor } = props
const design = computed(() => editor.design.value)
const element = computed(() => props.element)

/** Any field of the element: TypeScript can't follow a key across the union; the schema checks it on save. */
function set(update: Record<string, unknown>) {
  editor.apply(updateElements(design.value, [element.value.id], item => ({ ...item, ...update }) as SlipElement))
}

function numberOr(value: number | null | undefined, fallback: number, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

const SHAPES = new Set(['rect', 'ellipse', 'triangle'])
const alignItems = computed(() => ALIGNS.map(align => ({ value: align, icon: `i-lucide-align-${align === 'center' ? 'center' : align}`, label: t(`studio.field.align.${align}`) })))

const replaceOpen = ref(false)
function replace(image: ImageSummary) {
  replaceOpen.value = false
  set({ imageId: image.id, w: element.value.w, h: Math.round(element.value.w * image.height / image.width) })
}

/** The image becomes the background, and leaves the layers. */
function toBackground() {
  if (element.value.type !== 'image') return
  const next = removeElements(design.value, [element.value.id])
  editor.apply({ ...next, background: { ...next.background, imageId: element.value.imageId } })
  editor.select([])
}
</script>

<template>
  <div class="flex items-center gap-1">
    <template v-if="element.type === 'text'">
      <UButton
        :label="t('studio.text.edit')"
        icon="i-lucide-pencil"
        size="xs"
        color="neutral"
        variant="outline"
        @click="emit('editText', element.id)"
      />
      <UInputNumber
        :model-value="element.size"
        :min="6"
        :max="400"
        size="xs"
        class="w-24"
        :aria-label="t('studio.field.size')"
        @update:model-value="set({ size: numberOr($event, element.size, 6, 400) })"
      />
      <UButton
        icon="i-lucide-bold"
        size="xs"
        color="neutral"
        :variant="element.bold ? 'solid' : 'outline'"
        :aria-label="t('studio.field.bold')"
        :aria-pressed="element.bold"
        @click="set({ bold: !element.bold })"
      />
      <UButton
        v-for="item in alignItems"
        :key="item.value"
        :icon="item.icon"
        size="xs"
        color="neutral"
        :variant="element.align === item.value ? 'solid' : 'outline'"
        :aria-label="item.label"
        :aria-pressed="element.align === item.value"
        @click="set({ align: item.value })"
      />
      <UPopover>
        <UButton
          :label="t('studio.field.color')"
          icon="i-lucide-palette"
          size="xs"
          color="neutral"
          variant="outline"
        />
        <template #content>
          <div class="w-72 space-y-3 p-3">
            <ColorField
              :value="element.color"
              :design="design"
              :label="t('studio.field.color')"
              @change="set({ color: $event ?? '#111827' })"
            />
            <UFormField :label="t('studio.text.lineSpacing')">
              <UInputNumber
                :model-value="element.lineHeight"
                :min="0.8"
                :max="3"
                :step="0.1"
                size="sm"
                @update:model-value="set({ lineHeight: numberOr($event, element.lineHeight, 0.8, 3) })"
              />
            </UFormField>
          </div>
        </template>
      </UPopover>
    </template>

    <UPopover v-else-if="SHAPES.has(element.type) || element.type === 'line'">
      <UButton
        :label="t('studio.shape.style')"
        icon="i-lucide-paintbrush"
        size="xs"
        color="neutral"
        variant="outline"
      />
      <template #content>
        <div class="w-80 space-y-3 p-3">
          <ColorField
            v-if="'fill' in element"
            :value="element.fill"
            :design="design"
            :label="t('studio.shape.fill')"
            allow-none
            @change="set({ fill: $event })"
          />
          <ColorField
            :value="'stroke' in element ? element.stroke : 'color' in element ? element.color : null"
            :design="design"
            :label="element.type === 'line' ? t('studio.shape.lineColor') : t('studio.shape.border')"
            :allow-none="element.type !== 'line'"
            @change="element.type === 'line' ? set({ color: $event ?? '#111827' }) : set({ stroke: $event })"
          />
          <div class="flex items-end gap-3">
            <UFormField
              v-if="'strokeWidth' in element"
              :label="t('studio.shape.width')"
            >
              <UInputNumber
                :model-value="element.strokeWidth"
                :min="element.type === 'line' ? 1 : 0"
                :max="100"
                size="sm"
                class="w-24"
                @update:model-value="set({ strokeWidth: numberOr($event, element.strokeWidth, element.type === 'line' ? 1 : 0, 100) })"
              />
            </UFormField>
            <UFormField
              v-if="element.type === 'rect'"
              :label="t('studio.shape.radius')"
            >
              <UInputNumber
                :model-value="element.radius"
                :min="0"
                :max="1000"
                size="sm"
                class="w-24"
                @update:model-value="set({ radius: numberOr($event, element.radius, 0, 1000) })"
              />
            </UFormField>
          </div>
          <UCheckbox
            v-if="'dashed' in element"
            :model-value="element.dashed"
            :label="t('studio.shape.dashed')"
            @update:model-value="set({ dashed: Boolean($event) })"
          />
        </div>
      </template>
    </UPopover>

    <template v-else-if="element.type === 'icon'">
      <UButton
        v-for="icon in (['tick', 'star'] as const)"
        :key="icon"
        :icon="icon === 'tick' ? 'i-lucide-check' : 'i-lucide-star'"
        size="xs"
        color="neutral"
        :variant="element.icon === icon ? 'solid' : 'outline'"
        :aria-label="t(`studio.elements.${icon}`)"
        :aria-pressed="element.icon === icon"
        @click="set({ icon })"
      />
      <UPopover>
        <UButton
          :label="t('studio.field.color')"
          icon="i-lucide-palette"
          size="xs"
          color="neutral"
          variant="outline"
        />
        <template #content>
          <div class="w-72 p-3">
            <ColorField
              :value="element.color"
              :design="design"
              :label="t('studio.field.color')"
              @change="set({ color: $event ?? '#111827' })"
            />
          </div>
        </template>
      </UPopover>
    </template>

    <template v-else-if="element.type === 'image'">
      <UPopover v-model:open="replaceOpen">
        <UButton
          :label="t('studio.image.replace')"
          icon="i-lucide-replace"
          size="xs"
          color="neutral"
          variant="outline"
        />
        <template #content>
          <div class="max-h-[60vh] w-80 overflow-y-auto p-3">
            <ImagePicker
              :choose-label="t('studio.image.replace')"
              @choose="replace"
            />
          </div>
        </template>
      </UPopover>
      <UButton
        :label="t('studio.uploads.setBackground')"
        icon="i-lucide-image"
        size="xs"
        color="neutral"
        variant="outline"
        @click="toBackground"
      />
    </template>
  </div>
</template>
