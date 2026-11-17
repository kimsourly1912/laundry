<script setup lang="ts">
/**
 * The toolbar above the canvas (plan §5.4): one field's settings, position and size; or align and
 * spread for several. Each change is one undo step.
 */
import type { SlipElement } from '#shared/contracts/slip-design'
import type { StudioEditor } from '../composables/useStudioEditor'
import { alignElements, roundBox, spreadElements, updateElements } from '../utils/design-ops'
import type { Alignment } from '../utils/design-ops'
import FieldSettings from './FieldSettings.vue'

const props = defineProps<{ editor: StudioEditor }>()
const { t } = useI18n()
const { editor } = props

const element = computed(() => (editor.selected.value.length === 1 ? editor.selected.value[0] : undefined))
/** Several fields (plan §5.4): align and spread act on them together. */
const several = computed(() => editor.selected.value.length > 1)
const ALIGNMENTS: { value: Alignment, icon: string }[] = [
  { value: 'left', icon: 'i-lucide-align-start-vertical' },
  { value: 'center', icon: 'i-lucide-align-center-vertical' },
  { value: 'right', icon: 'i-lucide-align-end-vertical' },
  { value: 'top', icon: 'i-lucide-align-start-horizontal' },
  { value: 'middle', icon: 'i-lucide-align-center-horizontal' },
  { value: 'bottom', icon: 'i-lucide-align-end-horizontal' },
]
const movableIds = () => editor.selected.value.map(item => item.id)
function align(alignment: Alignment) {
  editor.apply(alignElements(editor.design.value, movableIds(), alignment))
}
function spread(direction: 'across' | 'down') {
  editor.apply(spreadElements(editor.design.value, movableIds(), direction))
}

type BoxKey = 'x' | 'y' | 'w' | 'h'
const BOX_FIELDS: { key: BoxKey, min: number, max: number }[] = [
  { key: 'x', min: -10_000, max: 10_000 },
  { key: 'y', min: -10_000, max: 10_000 },
  { key: 'w', min: 1, max: 10_000 },
  { key: 'h', min: 1, max: 10_000 },
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
</script>

<template>
  <!-- Always there, empty without a selection: the canvas below never moves when one starts. -->
  <div
    class="flex h-12 shrink-0 items-center gap-3 overflow-x-auto border-b border-default bg-default px-3"
    data-testid="element-toolbar"
  >
    <template v-if="several">
      <span class="text-xs text-muted">{{ t('studio.toolbar.selected', { count: editor.selected.value.length }) }}</span>
      <UButton
        v-for="item in ALIGNMENTS"
        :key="item.value"
        :icon="item.icon"
        size="xs"
        color="neutral"
        variant="outline"
        :aria-label="t(`studio.toolbar.align.${item.value}`)"
        @click="align(item.value)"
      />
      <UButton
        icon="i-lucide-align-horizontal-space-around"
        size="xs"
        color="neutral"
        variant="outline"
        :disabled="editor.selected.value.length < 3"
        :aria-label="t('studio.toolbar.spreadAcross')"
        @click="spread('across')"
      />
      <UButton
        icon="i-lucide-align-vertical-space-around"
        size="xs"
        color="neutral"
        variant="outline"
        :disabled="editor.selected.value.length < 3"
        :aria-label="t('studio.toolbar.spreadDown')"
        @click="spread('down')"
      />
    </template>
    <span
      v-else-if="!element"
      class="text-sm text-muted"
    >{{ t('studio.toolbar.none') }}</span>
    <template v-else>
      <FieldSettings
        :editor="editor"
        :element="element"
      />
      <USeparator
        orientation="vertical"
        class="h-6"
      />
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
    </template>
  </div>
</template>
