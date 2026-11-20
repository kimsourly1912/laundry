<script setup lang="ts">
import { parseCount, stepCount } from '../utils/count'

const props = defineProps<{
  label: string
  range: { min: number, max: number, decimals: number }
  testId?: string
}>()
const count = defineModel<number>()
const { t } = useI18n()
const typed = ref<string>()
const text = computed(() => {
  if (typed.value !== undefined && Object.is(parseCount(typed.value), count.value)) return typed.value
  return typeof count.value === 'number' && Number.isFinite(count.value) ? String(count.value) : typed.value ?? ''
})

function updateText(value: string) {
  typed.value = value
  count.value = parseCount(value)
}

function step(direction: 1 | -1) {
  const next = stepCount(count.value, direction, props.range)
  typed.value = next === undefined ? '' : String(next)
  count.value = next
}
</script>

<template>
  <UFieldGroup size="xl">
    <UButton
      type="button"
      icon="i-lucide-minus"
      color="neutral"
      variant="outline"
      :aria-label="t('orders.form.less', { label })"
      @click="step(-1)"
    />
    <UInput
      :model-value="text"
      :inputmode="range.decimals ? 'decimal' : 'numeric'"
      autocomplete="off"
      class="w-16"
      :ui="{ base: 'text-center tabular-nums' }"
      :aria-label="label"
      :data-testid="testId"
      @update:model-value="updateText(String($event))"
    />
    <UButton
      type="button"
      icon="i-lucide-plus"
      color="neutral"
      variant="outline"
      :aria-label="t('orders.form.more', { label })"
      @click="step(1)"
    />
  </UFieldGroup>
</template>
