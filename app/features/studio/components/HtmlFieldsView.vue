<script setup lang="ts">
/**
 * The Studio sidebar's Intake fields view: what staff enter on each order (D35), placed in the markup
 * as `{{fields.<id>}}`. Rename, set a price key or Required, copy the placeholder, remove, add one, or
 * add several from the item list (D42). Every edit hands the page a new design.
 */
import { MAX_ELEMENTS } from '#shared/contracts/slip-design'
import type { SlipDesign } from '#shared/contracts/slip-design'
import { FIELD_PREFIX } from '#shared/html-slip/catalog'
import type { IntakeItem } from '#shared/html-slip/items'
import { intakeField } from '#shared/html-slip/items'
import { createElement } from '#shared/slip/elements'
import { isOwnerField } from '#shared/slip/fields'
import type { OwnerField } from '#shared/slip/fields'
import HtmlItemListModal from './HtmlItemListModal.vue'
import PriceKeySelect from './PriceKeySelect.vue'

const props = defineProps<{ design: SlipDesign, readOnly: boolean }>()
const emit = defineEmits<{ change: [design: SlipDesign] }>()
const { t } = useI18n()
const toast = useToast()

const fields = computed(() => props.design.elements.filter(isOwnerField))
const full = computed(() => props.design.elements.length >= MAX_ELEMENTS)
const placeholderOf = (id: string) => `{{${FIELD_PREFIX}${id}}}`

function change(patch: Partial<SlipDesign>) {
  emit('change', { ...props.design, ...patch })
}
function updateField(field: OwnerField, patch: { label?: string, required?: boolean, printRequired?: boolean, priceKey?: string }) {
  change({ elements: props.design.elements.map(item => item.id === field.id ? { ...field, ...patch } : item) })
}
function remove(field: OwnerField) {
  change({ elements: props.design.elements.filter(item => item.id !== field.id), fillOrder: props.design.fillOrder.filter(key => key !== field.id) })
}
/** One Required box for both checks: staff must enter it, and the HTML must print it. */
function requiredState(field: OwnerField): boolean | 'indeterminate' {
  const onSlip = 'printRequired' in field && Boolean(field.printRequired)
  return field.required === onSlip ? onSlip : 'indeterminate'
}

/** A stable key from the label ("Bed sheets" → `bed_sheets`), made unique within the design. */
function keyFromLabel(label: string): string {
  return uniqueKey(label.toLowerCase().replace(/[^a-z\d]+/g, '_').replace(/^[^a-z]+|_+$/g, '').slice(0, 36) || 'field')
}
/** `slug`, or `slug_2`, `slug_3`… when the design or `taken` already uses it. */
function uniqueKey(slug: string, taken: ReadonlySet<string> = new Set()): string {
  const used = new Set(['paid', ...taken, ...props.design.elements.map(item => item.id), ...props.design.groups.map(item => item.id)])
  let key = slug
  for (let n = 2; used.has(key); n++) key = `${slug}_${n}`
  return key
}

/** Add from list (D42): each item's field with the list's price key; an id already used gets a suffix. */
const itemsOpen = ref(false)
function addItems(items: IntakeItem[]) {
  const taken = new Set<string>()
  const added = items.slice(0, MAX_ELEMENTS - props.design.elements.length).map((item) => {
    const field = intakeField(item)
    const id = uniqueKey(field.id, taken)
    taken.add(id)
    return { ...field, id }
  })
  change({ elements: [...props.design.elements, ...added], fillOrder: [...props.design.fillOrder, ...added.map(field => field.id)] })
}

const adding = ref(false)
const newLabel = ref('')
const newPriceKey = ref<string>()
const newType = ref<'count' | 'weight' | 'text' | 'checkbox'>('count')
const fieldTypes = computed(() => (['count', 'weight', 'text', 'checkbox'] as const).map(value => ({ value, label: t(`studio.html.fieldType.${value}`) })))
const usesPrice = computed(() => newType.value === 'count' || newType.value === 'weight')
// A count and a weight price from different items (D43): switching between them drops the choice.
watch(newType, () => {
  newPriceKey.value = undefined
})
const canAddField = computed(() => Boolean(newLabel.value.trim()) && !full.value)

function addField() {
  if (!canAddField.value) return
  const label = newLabel.value.trim()
  const id = keyFromLabel(label)
  const kg = newType.value === 'weight'
  const field = newType.value === 'text'
    ? createElement('textField', { id }, { label })
    : newType.value === 'checkbox'
      ? createElement('checkbox', { id }, { label })
      : createElement('number', { id }, { label, priceKey: newPriceKey.value, decimals: kg ? 2 : 0, max: kg ? 100 : 999, unit: kg ? 'kg' : '' })
  change({ elements: [...props.design.elements, field], fillOrder: [...props.design.fillOrder, id] })
  closeAdd()
}
function closeAdd() {
  adding.value = false
  newLabel.value = ''
  newType.value = 'count'
  newPriceKey.value = undefined
}

async function copyPlaceholder(id: string) {
  try {
    await navigator.clipboard.writeText(placeholderOf(id))
    toast.add({ title: t('studio.html.copied'), color: 'success', icon: 'i-lucide-clipboard-check' })
  }
  catch {
    toast.add({ title: t('studio.html.copyFailed'), color: 'error' })
  }
}
</script>

<template>
  <div class="space-y-4">
    <p class="text-sm text-muted">
      {{ t('studio.html.fieldsHint') }}
    </p>

    <ul class="divide-y divide-default rounded-md border border-default bg-default">
      <li
        v-for="field in fields"
        :key="field.id"
        class="space-y-2 p-2"
        :data-testid="`field-${field.id}`"
      >
        <div class="flex items-center gap-1">
          <UInput
            :model-value="field.label"
            :disabled="readOnly"
            size="sm"
            class="min-w-0 flex-1"
            :placeholder="t('studio.html.fieldLabel')"
            :aria-label="t('studio.html.fieldLabel')"
            @change="updateField(field, { label: ($event.target as HTMLInputElement).value })"
          />
          <UTooltip :text="placeholderOf(field.id)">
            <UButton
              icon="i-lucide-braces"
              color="neutral"
              variant="ghost"
              size="xs"
              :aria-label="t('studio.html.copyPlaceholder', { placeholder: placeholderOf(field.id) })"
              @click="copyPlaceholder(field.id)"
            />
          </UTooltip>
          <UButton
            v-if="!readOnly"
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="t('studio.html.removeField')"
            @click="remove(field)"
          />
        </div>
        <div
          v-if="field.type !== 'phone' && field.type !== 'amount'"
          class="flex items-center gap-3"
        >
          <PriceKeySelect
            v-if="field.type === 'number'"
            :model-value="field.priceKey"
            :weight="field.unit === 'kg'"
            :disabled="readOnly"
            size="sm"
            class="min-w-0 flex-1"
            :test-id="`price-key-${field.id}`"
            @update:model-value="updateField(field, { priceKey: $event })"
          />
          <span
            v-else
            class="flex-1"
          />
          <UCheckbox
            :model-value="requiredState(field)"
            :disabled="readOnly"
            :label="t('studio.html.required')"
            size="sm"
            class="shrink-0"
            @update:model-value="updateField(field, { required: $event === true, printRequired: $event === true })"
          />
        </div>
      </li>
    </ul>

    <template v-if="!readOnly">
      <form
        v-if="adding"
        class="space-y-3 rounded-md border border-default bg-default p-3"
        @submit.prevent="addField"
      >
        <UFormField :label="t('studio.html.fieldLabel')">
          <UInput
            v-model="newLabel"
            :maxlength="60"
            class="w-full"
            autofocus
            data-testid="count-label"
          />
        </UFormField>
        <UFormField :label="t('studio.html.fieldType.title')">
          <USelect
            v-model="newType"
            :items="fieldTypes"
            class="w-full"
          />
        </UFormField>
        <UFormField
          v-if="usesPrice"
          :label="t('studio.field.priceKey')"
        >
          <PriceKeySelect
            v-model="newPriceKey"
            :weight="newType === 'weight'"
            test-id="count-key"
          />
        </UFormField>
        <div class="flex gap-2">
          <UButton
            type="submit"
            :label="t('studio.html.addField')"
            :disabled="!canAddField"
            data-testid="add-count"
          />
          <UButton
            :label="t('common.actions.cancel')"
            color="neutral"
            variant="ghost"
            @click="closeAdd"
          />
        </div>
      </form>
      <div
        v-else
        class="flex flex-wrap gap-2"
      >
        <UButton
          :label="t('studio.html.itemList.open')"
          icon="i-lucide-list-plus"
          color="neutral"
          variant="outline"
          :disabled="full"
          data-testid="add-from-list"
          @click="itemsOpen = true"
        />
        <UButton
          :label="t('studio.html.addField')"
          icon="i-lucide-plus"
          color="neutral"
          variant="ghost"
          :disabled="full"
          data-testid="new-field"
          @click="adding = true"
        />
      </div>
    </template>

    <HtmlItemListModal
      v-model:open="itemsOpen"
      :elements="design.elements"
      :room="MAX_ELEMENTS - design.elements.length"
      @add="addItems"
    />
  </div>
</template>
