<script setup lang="ts">
const props = defineProps<{
  label: string
  range: { min: number, max: number, decimals: number }
  testId?: string
  required?: boolean
}>()
/** An empty box is `undefined` and stays empty on the slip; it never shows a 0. */
const count = defineModel<number>()
const { t } = useI18n()
// Keep extra digits visible so the slip can report a precision error.
const formatOptions = { useGrouping: false, maximumFractionDigits: 20 }

function update(value: number | null | undefined) {
  count.value = typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

// The order form and live studio preview both validate as the owner types, before blur.
function onInput(event: Event) {
  const text = (event.target as HTMLInputElement).value.trim()
  const value = Number(text)
  if (!text) update(undefined)
  else if (Number.isFinite(value)) update(value)
}

// Accept a decimal keypad that submits a comma before the English number parser checks it.
function onBeforeInput(event: InputEvent) {
  const text = event.data ?? event.dataTransfer?.getData('text/plain')
  if (!props.range.decimals || event.isComposing || !text || !/^-?\d*,\d*$/.test(text) || !event.cancelable) return
  const input = event.target as HTMLInputElement
  const start = input.selectionStart ?? input.value.length
  const end = input.selectionEnd ?? start
  if (input.value.slice(0, start).includes('.') || input.value.slice(end).includes('.')) return
  event.preventDefault()
  input.setRangeText(text.replace(',', '.'), start, end, 'end')
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
</script>

<template>
  <UInputNumber
    :model-value="count ?? null"
    :min="range.min"
    :max="range.max"
    :step="1"
    :starting-value="1"
    :step-snapping="false"
    :decrement-disabled="count === undefined"
    :format-options="formatOptions"
    :inputmode="range.decimals ? 'decimal' : 'numeric'"
    locale="en"
    :aria-label="label"
    :required="required"
    :data-testid="testId"
    disable-wheel-change
    allow-invalid
    class="w-36 max-w-full"
    @beforeinput.capture="onBeforeInput"
    @input="onInput"
    @update:model-value="update"
  >
    <template #decrement>
      <UButton
        icon="i-lucide-minus"
        variant="link"
        :aria-label="t('slipFill.removeOne', { field: label })"
      />
    </template>
    <template #increment>
      <UButton
        icon="i-lucide-plus"
        variant="link"
        :aria-label="t('slipFill.addOne', { field: label })"
      />
    </template>
  </UInputNumber>
</template>
