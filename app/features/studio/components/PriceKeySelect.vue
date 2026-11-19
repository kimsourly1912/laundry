<script setup lang="ts">
/**
 * What a count or weight is priced as (D43): an item from the laundry item list, or nothing for a
 * plain count. Weights pick from the per-kg items, counts from the per-piece ones, so a slip's key is
 * always one the shops' prices know. A key from before D43 that isn't on the list still shows, so it
 * can be replaced.
 */
import { PRICED_ITEMS } from '#shared/html-slip/items'

const props = defineProps<{ weight: boolean, disabled?: boolean, testId?: string }>()
const key = defineModel<string | undefined>({ required: true })
const { t } = useI18n()

// Reka's ComboboxItem rejects an empty value, so "no price" is a value no price key can be:
// keys start with a letter or digit (`priceKeySchema`).
const NONE = '-'
const items = computed(() => {
  const kind = props.weight ? 'weight' : 'count'
  const listed = PRICED_ITEMS.filter(item => item.kind === kind).map(item => ({ label: item.label, value: item.key }))
  const unknown = key.value && !listed.some(item => item.value === key.value) ? [{ label: key.value, value: key.value }] : []
  return [{ label: t('studio.field.noPrice'), value: NONE }, ...unknown, ...listed]
})
const selected = computed({
  get: () => key.value ?? NONE,
  set: (value: string) => {
    key.value = value === NONE ? undefined : value
  },
})
</script>

<template>
  <USelectMenu
    v-model="selected"
    :items="items"
    value-key="value"
    :disabled="disabled"
    :search-input="{ placeholder: t('studio.html.itemList.search') }"
    :aria-label="t('studio.field.priceKey')"
    :data-testid="testId"
    class="w-full"
  />
</template>
