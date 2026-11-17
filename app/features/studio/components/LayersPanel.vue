<script setup lang="ts">
/**
 * Layers (plan §5.3): every element, top first, with the background last. Click selects (Shift
 * adds), drag reorders, double-click renames, and each row hides or locks its element. Locked and
 * hidden elements are selected here, since the canvas can't select them.
 */
import type { StudioEditor } from '../composables/useStudioEditor'
import { placeLayer, updateElements } from '../utils/design-ops'

const props = defineProps<{ editor: StudioEditor }>()
const { t } = useI18n()
const { editor } = props

const rows = computed(() => [...editor.design.value.elements].reverse())
const renaming = ref<string>()
const draftName = ref('')
const dragging = ref<string>()
const dropAt = ref<number>()

function onClick(id: string, event: MouseEvent) {
  const current = editor.selection.value
  if (event.shiftKey) editor.select(current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  else editor.select([id])
}

function startRename(id: string, name: string) {
  renaming.value = id
  draftName.value = name
}

function finishRename() {
  const id = renaming.value
  renaming.value = undefined
  const name = draftName.value.trim().slice(0, 60)
  if (id && name) editor.apply(updateElements(editor.design.value, [id], element => ({ ...element, name })))
}

function toggle(id: string, key: 'hidden' | 'locked') {
  editor.apply(updateElements(editor.design.value, [id], element => ({ ...element, [key]: !element[key] })))
}

function onDrop(index: number) {
  if (dragging.value) editor.apply(placeLayer(editor.design.value, dragging.value, index))
  dragging.value = undefined
  dropAt.value = undefined
}
</script>

<template>
  <div class="space-y-2">
    <h2 class="px-1 text-sm font-semibold">
      {{ t('studio.layers.title') }}
    </h2>
    <p
      v-if="!rows.length"
      class="px-1 text-sm text-muted"
    >
      {{ t('studio.layers.empty') }}
    </p>
    <ul
      class="space-y-0.5"
      data-testid="layers"
    >
      <li
        v-for="(element, index) in rows"
        :key="element.id"
        draggable="true"
        class="group flex items-center gap-1 rounded-md px-1 py-0.5 text-sm"
        :class="[
          editor.selection.value.includes(element.id) ? 'bg-primary/10' : 'hover:bg-elevated',
          dropAt === index ? 'border-t-2 border-primary' : '',
        ]"
        :data-testid="`layer-${element.id}`"
        @dragstart="dragging = element.id"
        @dragover.prevent="dropAt = index"
        @dragleave="dropAt = undefined"
        @drop.prevent="onDrop(index)"
        @dragend="dragging = undefined; dropAt = undefined"
      >
        <UInput
          v-if="renaming === element.id"
          v-model="draftName"
          size="xs"
          autofocus
          :aria-label="t('studio.layers.rename')"
          class="flex-1"
          @keydown.enter="finishRename"
          @keydown.esc="renaming = undefined"
          @blur="finishRename"
        />
        <button
          v-else
          type="button"
          class="min-w-0 flex-1 truncate py-1 text-left"
          :class="{ 'text-muted': element.hidden }"
          @click="onClick(element.id, $event)"
          @dblclick="startRename(element.id, element.name)"
        >
          {{ element.name || element.type }}
        </button>
        <UButton
          :icon="element.hidden ? 'i-lucide-eye-off' : 'i-lucide-eye'"
          size="xs"
          color="neutral"
          variant="ghost"
          :aria-label="element.hidden ? t('studio.layers.show', { name: element.name }) : t('studio.layers.hide', { name: element.name })"
          @click="toggle(element.id, 'hidden')"
        />
        <UButton
          :icon="element.locked ? 'i-lucide-lock' : 'i-lucide-lock-open'"
          size="xs"
          color="neutral"
          variant="ghost"
          :aria-label="element.locked ? t('studio.layers.unlock', { name: element.name }) : t('studio.layers.lock', { name: element.name })"
          @click="toggle(element.id, 'locked')"
        />
      </li>
      <li
        class="flex items-center gap-2 rounded-md px-1 py-1.5 text-sm text-muted"
        @dragover.prevent="dropAt = rows.length"
        @drop.prevent="onDrop(rows.length)"
      >
        <UIcon
          name="i-lucide-image"
          class="size-4"
        />
        {{ editor.design.value.background.imageId ? t('studio.layers.backgroundPhoto') : t('studio.layers.background') }}
      </li>
    </ul>
  </div>
</template>
