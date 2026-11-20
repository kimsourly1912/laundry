<script setup lang="ts">
/**
 * The Studio sidebar's Intake fields view: what staff enter on each order (D35), placed in the markup
 * as `{{fields.<id>}}`. Each field says whether the slip prints it, and can put its placeholder at the
 * editor's cursor; Test order fills the slip to check (pilot plan §1). Rename, Required, remove, add
 * one, or add several from the item list (D42). Fields record quantities and ticks only; staff type
 * the total (D44). Every edit
 * hands the page a new design.
 */
import { MAX_ELEMENTS } from '#shared/contracts/slip-design'
import type { SlipDesign } from '#shared/contracts/slip-design'
import type { IntakeItem } from '#shared/html-slip/items'
import { intakeField } from '#shared/html-slip/items'
import { fieldPlaceholder, fieldPlacement, usedPlaceholders } from '#shared/slip/checks'
import { createElement } from '#shared/slip/elements'
import { isOwnerField } from '#shared/slip/fields'
import type { OwnerField } from '#shared/slip/fields'
import HtmlItemListModal from './HtmlItemListModal.vue'
import HtmlFieldRow from './HtmlFieldRow.vue'

const props = defineProps<{ design: SlipDesign, readOnly: boolean }>()
const emit = defineEmits<{ change: [design: SlipDesign], insert: [text: string], test: [] }>()
const { t } = useI18n()
const toast = useToast()

const fields = computed(() => props.design.elements.filter(isOwnerField))
const full = computed(() => props.design.elements.length >= MAX_ELEMENTS)
/** `{{order.total}}` and `{{order.phone}}` for the built-ins, `{{fields.<id>}}` for the rest. */
const placeholderOf = (field: OwnerField) => `{{${fieldPlaceholder(field)}}}`

/**
 * Phone and amount are the order's own details (every order stores them): built in, renamed but
 * never removed here. A design without one (an old draft) offers to add it back.
 */
const BUILT_IN = ['phone', 'amount'] as const
type BuiltInType = typeof BUILT_IN[number]
const isBuiltIn = (field: OwnerField) => (BUILT_IN as readonly string[]).includes(field.type)
const builtIns = computed(() => fields.value.filter(isBuiltIn))
const items = computed(() => fields.value.filter(field => !isBuiltIn(field)))
const missingBuiltIns = computed(() => BUILT_IN.filter(type => !fields.value.some(field => field.type === type)))
function addBuiltIn(type: BuiltInType) {
  const id = uniqueKey(type === 'amount' ? 'total' : 'phone')
  change({ elements: [...props.design.elements, createElement(type, { id })], fillOrder: [...props.design.fillOrder, id] })
}

/** The markup's placeholders, read as the publish check reads them, and where each field stands. */
const used = computed(() => usedPlaceholders(props.design))
const placementOf = (field: OwnerField) => fieldPlacement(field, used.value)
const placedCount = computed(() => fields.value.filter(field => placementOf(field) === 'placed').length)
const unplacedCount = computed(() => fields.value.filter(field => placementOf(field) === 'unplaced').length)

function change(patch: Partial<SlipDesign>) {
  emit('change', { ...props.design, ...patch })
}
function updateField(field: OwnerField, patch: { label?: string, required?: boolean, printRequired?: boolean, portalOnly?: boolean }) {
  change({ elements: props.design.elements.map(item => item.id === field.id ? { ...field, ...patch } : item) })
}
function remove(field: OwnerField) {
  change({ elements: props.design.elements.filter(item => item.id !== field.id), fillOrder: props.design.fillOrder.filter(key => key !== field.id) })
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

/** Add from list (D42): each item's field, a quantity with no price; an id already used gets a suffix. */
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
const newType = ref<'count' | 'weight' | 'text' | 'checkbox'>('count')
const fieldTypes = computed(() => (['count', 'weight', 'text', 'checkbox'] as const).map(value => ({ value, label: t(`studio.html.fieldType.${value}`) })))
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
      : createElement('number', { id }, { label, decimals: kg ? 2 : 0, max: kg ? 100 : 999, unit: kg ? 'kg' : '' })
  change({ elements: [...props.design.elements, field], fillOrder: [...props.design.fillOrder, id] })
  closeAdd()
}
function closeAdd() {
  adding.value = false
  newLabel.value = ''
  newType.value = 'count'
}

async function copyPlaceholder(field: OwnerField) {
  try {
    await navigator.clipboard.writeText(placeholderOf(field))
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

    <!-- What the printout shows so far, and the way to check it with an example order. -->
    <div class="flex flex-wrap items-center gap-2 rounded-lg border border-default bg-elevated/50 p-2 ps-3">
      <p
        class="me-auto text-sm"
        :class="unplacedCount ? 'text-warning' : 'text-muted'"
        role="status"
        data-testid="placement-summary"
      >
        {{ unplacedCount
          ? t('studio.html.placement.summaryUnplaced', { count: unplacedCount }, unplacedCount)
          : t('studio.html.placement.summary', { placed: placedCount, total: fields.length }) }}
      </p>
      <UButton
        :label="t('studio.html.customSample.button')"
        icon="i-lucide-flask-conical"
        color="neutral"
        variant="outline"
        size="sm"
        :disabled="!design.html?.trim()"
        data-testid="fields-test-order"
        @click="emit('test')"
      />
    </div>

    <section class="space-y-2">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">
        {{ t('studio.html.builtInTitle') }}
      </h3>
      <ul class="space-y-2">
        <HtmlFieldRow
          v-for="field in builtIns"
          :key="field.id"
          :field="field"
          :read-only="readOnly"
          built-in
          :placement="placementOf(field)"
          @update="updateField(field, $event)"
          @copy="copyPlaceholder(field)"
          @insert="emit('insert', placeholderOf(field))"
        />
      </ul>
      <div
        v-if="!readOnly && missingBuiltIns.length"
        class="flex flex-wrap gap-2"
      >
        <UButton
          v-for="type in missingBuiltIns"
          :key="type"
          :label="t('studio.html.addBuiltIn', { field: t(`studio.html.fieldType.${type}`) })"
          icon="i-lucide-plus"
          color="neutral"
          variant="outline"
          size="sm"
          :disabled="full"
          :data-testid="`add-built-in-${type}`"
          @click="addBuiltIn(type)"
        />
      </div>
    </section>

    <section class="space-y-2">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">
        {{ t('studio.html.itemsTitle') }}
      </h3>
      <ul
        v-if="items.length"
        class="space-y-2"
      >
        <HtmlFieldRow
          v-for="field in items"
          :key="field.id"
          :field="field"
          :read-only="readOnly"
          :built-in="false"
          :placement="placementOf(field)"
          @update="updateField(field, $event)"
          @remove="remove(field)"
          @copy="copyPlaceholder(field)"
          @insert="emit('insert', placeholderOf(field))"
        />
      </ul>
      <p
        v-else
        class="rounded-lg border border-dashed border-default p-3 text-center text-sm text-muted"
      >
        {{ t('studio.html.noItems') }}
      </p>
    </section>

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
