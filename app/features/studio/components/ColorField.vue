<script setup lang="ts">
/**
 * A colour (plan §5.5): the slip's recent colours, a picker, and a hex box. `allowNone` adds "None"
 * for fills and borders. Emits once per choice, so each is one undo step.
 */
import type { SlipDesign } from '#shared/contracts/slip-design'

const props = defineProps<{ value: string | null, design: SlipDesign, label: string, allowNone?: boolean }>()
const emit = defineEmits<{ change: [value: string | null] }>()
const { t } = useI18n()

const HEX = /^#[\da-f]{6}$/i

/** The colours already on the slip, most used first, at most 8. */
const recent = computed(() => {
  const counts = new Map<string, number>()
  for (const element of props.design.elements) {
    for (const key of ['color', 'fill', 'stroke'] as const) {
      const value = (element as Record<string, unknown>)[key]
      if (typeof value === 'string' && HEX.test(value)) counts.set(value.toLowerCase(), (counts.get(value.toLowerCase()) ?? 0) + 1)
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([color]) => color)
})

const hex = ref(props.value ?? '')
watch(() => props.value, (value) => {
  hex.value = value ?? ''
})
function commitHex() {
  const value = hex.value.trim()
  const normal = value.startsWith('#') ? value : `#${value}`
  if (HEX.test(normal)) emit('change', normal.toLowerCase())
  else hex.value = props.value ?? ''
}
</script>

<template>
  <fieldset class="space-y-2">
    <legend class="text-xs text-muted">
      {{ label }}
    </legend>
    <div class="flex flex-wrap items-center gap-1.5">
      <button
        v-if="allowNone"
        type="button"
        class="size-6 rounded border border-default bg-[linear-gradient(135deg,transparent_45%,red_45%,red_55%,transparent_55%)]"
        :class="value === null ? 'ring-2 ring-primary' : ''"
        :aria-label="t('studio.color.none')"
        :aria-pressed="value === null"
        @click="emit('change', null)"
      />
      <button
        v-for="color in recent"
        :key="color"
        type="button"
        class="size-6 rounded border border-default"
        :class="value === color ? 'ring-2 ring-primary' : ''"
        :style="{ background: color }"
        :aria-label="color"
        :aria-pressed="value === color"
        @click="emit('change', color)"
      />
      <input
        type="color"
        :value="value ?? '#000000'"
        class="h-6 w-8 cursor-pointer rounded border border-default"
        :aria-label="t('studio.color.pick', { label })"
        @change="emit('change', ($event.target as HTMLInputElement).value)"
      >
      <UInput
        v-model="hex"
        size="xs"
        class="w-24"
        :aria-label="t('studio.color.hex', { label })"
        @keydown.enter="commitHex"
        @blur="commitHex"
      />
    </div>
  </fieldset>
</template>
