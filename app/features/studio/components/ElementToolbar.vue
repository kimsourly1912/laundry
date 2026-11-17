<script setup lang="ts">
/**
 * The contextual toolbar for any one element (plan §5.5): position and size, rotation, opacity and
 * lock. Each change is one undo step. Type-specific settings join it in S3 and S4.
 */
import type { SlipElement } from '#shared/contracts/slip-design'
import type { StudioEditor } from '../composables/useStudioEditor'
import { roundBox, updateElements } from '../utils/design-ops'

const props = defineProps<{ editor: StudioEditor }>()
const { t } = useI18n()
const { editor } = props

const element = computed(() => (editor.selected.value.length === 1 ? editor.selected.value[0] : undefined))

type BoxKey = 'x' | 'y' | 'w' | 'h' | 'rotation'
const BOX_FIELDS: { key: BoxKey, min: number, max: number }[] = [
  { key: 'x', min: -10_000, max: 10_000 },
  { key: 'y', min: -10_000, max: 10_000 },
  { key: 'w', min: 1, max: 10_000 },
  { key: 'h', min: 1, max: 10_000 },
  { key: 'rotation', min: -180, max: 180 },
]

function change(update: Partial<SlipElement>) {
  const current = element.value
  if (!current) return
  editor.apply(updateElements(editor.design.value, [current.id], item => ({ ...item, ...update }) as SlipElement))
}

function setBox(key: BoxKey, value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return
  const field = BOX_FIELDS.find(item => item.key === key)!
  change({ [key]: roundBox(Math.min(field.max, Math.max(field.min, value))) })
}

const opacity = computed(() => Math.round((element.value?.opacity ?? 1) * 100))
function setOpacity(value: number | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) change({ opacity: Math.min(100, Math.max(0, value)) / 100 })
}
</script>

<template>
  <!-- Always there, empty without a selection: the canvas below never moves when one starts. -->
  <div
    class="flex h-12 shrink-0 items-center gap-3 overflow-x-auto border-b border-default bg-default px-3"
    data-testid="element-toolbar"
  >
    <span
      v-if="!element"
      class="text-sm text-muted"
    >{{ t('studio.toolbar.none') }}</span>
    <template v-else>
      <UFormField
        v-for="field in BOX_FIELDS"
        :key="field.key"
        :label="t(`studio.toolbar.${field.key}`)"
        orientation="horizontal"
        :ui="{ label: 'text-xs text-muted', container: 'mt-0' }"
        class="items-center gap-1.5"
      >
        <UInputNumber
          :model-value="element[field.key]"
          :min="field.min"
          :max="field.max"
          :step="1"
          :step-snapping="false"
          :format-options="{ maximumFractionDigits: 1, useGrouping: false }"
          size="xs"
          class="w-24"
          :increment="false"
          :decrement="false"
          @update:model-value="setBox(field.key, $event)"
        />
      </UFormField>
      <UFormField
        :label="t('studio.toolbar.opacity')"
        orientation="horizontal"
        :ui="{ label: 'text-xs text-muted', container: 'mt-0' }"
        class="items-center gap-1.5"
      >
        <UInputNumber
          :model-value="opacity"
          :min="0"
          :max="100"
          size="xs"
          class="w-20"
          :increment="false"
          :decrement="false"
          @update:model-value="setOpacity($event)"
        />
      </UFormField>
      <UButton
        :icon="element.locked ? 'i-lucide-lock' : 'i-lucide-lock-open'"
        :label="element.locked ? t('studio.canvas.unlock') : t('studio.canvas.lock')"
        size="xs"
        color="neutral"
        variant="outline"
        @click="change({ locked: !element.locked })"
      />
    </template>
  </div>
</template>
