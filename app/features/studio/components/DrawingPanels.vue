<script setup lang="ts">
/**
 * The Text and Elements tabs (plan §5.3): headings and body text (Khmer and English in one box), and
 * lines, rectangles, circles, triangles and two icons.
 */
import type { SlipElement } from '#shared/contracts/slip-design'
import { createElement, newKey } from '#shared/slip/elements'
import type { StudioEditor } from '../composables/useStudioEditor'
import { addElements } from '../utils/design-ops'

const props = defineProps<{ editor: StudioEditor, tab: 'text' | 'elements' }>()
const { t } = useI18n()
const { editor } = props

const TEXTS = [
  { key: 'heading', size: 48, bold: true, w: 500 },
  { key: 'subheading', size: 32, bold: true, w: 420 },
  { key: 'body', size: 24, bold: false, w: 360 },
] as const

function addText(item: typeof TEXTS[number]) {
  const element = createElement('text', { id: newKey(), w: item.w, h: Math.round(item.size * 1.4), name: t(`studio.text.${item.key}`) }, { text: t(`studio.text.${item.key}`), size: item.size, bold: item.bold })
  add(element)
}

type ShapeKey = 'line' | 'dashedLine' | 'rect' | 'roundedRect' | 'circle' | 'triangle' | 'tick' | 'star'
const SHAPES: { key: ShapeKey, icon: string }[] = [
  { key: 'line', icon: 'i-lucide-minus' },
  { key: 'dashedLine', icon: 'i-lucide-ellipsis' },
  { key: 'rect', icon: 'i-lucide-square' },
  { key: 'roundedRect', icon: 'i-lucide-square-dashed' },
  { key: 'circle', icon: 'i-lucide-circle' },
  { key: 'triangle', icon: 'i-lucide-triangle' },
  { key: 'tick', icon: 'i-lucide-check' },
  { key: 'star', icon: 'i-lucide-star' },
]

function shapeOf(key: ShapeKey): SlipElement {
  const placement = { id: newKey(), name: t(`studio.elements.${key}`) }
  switch (key) {
    case 'line': return createElement('line', placement)
    case 'dashedLine': return createElement('line', placement, { dashed: true })
    case 'rect': return createElement('rect', placement)
    case 'roundedRect': return createElement('rect', placement, { radius: 16 })
    case 'circle': return createElement('ellipse', placement)
    case 'triangle': return createElement('triangle', placement)
    case 'tick': return createElement('icon', placement, { icon: 'tick' })
    case 'star': return createElement('icon', placement, { icon: 'star' })
  }
}

function add(element: SlipElement) {
  editor.apply(addElements(editor.design.value, [element]))
  editor.select([element.id])
}
</script>

<template>
  <div
    v-if="tab === 'text'"
    class="space-y-3"
  >
    <h2 class="px-1 text-sm font-semibold">
      {{ t('studio.tabs.text') }}
    </h2>
    <button
      v-for="item in TEXTS"
      :key="item.key"
      type="button"
      class="block w-full rounded-md border border-default px-3 py-2 text-left hover:bg-elevated"
      :class="item.bold ? 'font-bold' : ''"
      :style="{ fontSize: `${Math.round(item.size / 2)}px` }"
      @click="addText(item)"
    >
      {{ t(`studio.text.${item.key}`) }}
    </button>
    <p class="px-1 text-xs text-muted">
      {{ t('studio.text.hint') }}
    </p>
  </div>
  <div
    v-else
    class="space-y-3"
  >
    <h2 class="px-1 text-sm font-semibold">
      {{ t('studio.tabs.elements') }}
    </h2>
    <div class="grid grid-cols-4 gap-2">
      <UButton
        v-for="item in SHAPES"
        :key="item.key"
        :icon="item.icon"
        color="neutral"
        variant="outline"
        class="aspect-square justify-center"
        :aria-label="t(`studio.elements.${item.key}`)"
        @click="add(shapeOf(item.key))"
      />
    </div>
  </div>
</template>
