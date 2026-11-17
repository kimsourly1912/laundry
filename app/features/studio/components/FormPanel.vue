<script setup lang="ts">
/**
 * The Fields panel (plan §5.1, §5.3): add the fields the owner fills and the fixed-meaning ones,
 * then the fill order, dragged to reorder. A fixed-meaning field can be added once (plan §5.3.3).
 */
import type { ElementType, SlipElement } from '#shared/contracts/slip-design'
import { PAID_KEY } from '#shared/contracts/slip-design'
import { createElement, createGroup, newKey, UNPAID_LABEL } from '#shared/slip/elements'
import { fillOrderOf } from '#shared/slip/fields'
import type { StudioEditor } from '../composables/useStudioEditor'
import { addElements, placeInFillOrder } from '../utils/design-ops'
import { fieldName } from '../utils/field-name'

const props = defineProps<{ editor: StudioEditor }>()
const { t } = useI18n()
const { editor } = props
const design = computed(() => editor.design.value)

type Addable = 'number' | 'textField' | 'checkbox' | 'choice' | 'orderNo' | 'date' | 'phone' | 'amount' | 'paid'
const OWNER: { kind: Addable, icon: string }[] = [
  { kind: 'number', icon: 'i-lucide-hash' },
  { kind: 'textField', icon: 'i-lucide-text-cursor-input' },
  { kind: 'checkbox', icon: 'i-lucide-square-check' },
  { kind: 'choice', icon: 'i-lucide-list-checks' },
]
const FIXED: { kind: Addable, icon: string }[] = [
  { kind: 'orderNo', icon: 'i-lucide-ticket' },
  { kind: 'date', icon: 'i-lucide-calendar' },
  { kind: 'phone', icon: 'i-lucide-phone' },
  { kind: 'amount', icon: 'i-lucide-banknote' },
  { kind: 'paid', icon: 'i-lucide-circle-dollar-sign' },
]

function has(type: ElementType) {
  return design.value.elements.some(element => element.type === type)
}

function add(kind: Addable) {
  const id = newKey()
  let elements: SlipElement[]
  let groups: ReturnType<typeof createGroup>[] = []
  let fillKeys: string[] = [id]
  if (kind === 'choice') {
    groups = [createGroup(id)]
    elements = [
      createElement('option', { id: newKey() }, { group: id }),
      createElement('option', { id: newKey(), x: 120 }, { group: id }),
    ]
  }
  else if (kind === 'paid') {
    elements = [
      createElement('paid', { id }),
      createElement('paid', { id: newKey(), x: 160 }, { value: 'unpaid', label: UNPAID_LABEL }),
    ]
    fillKeys = [PAID_KEY]
  }
  else {
    elements = [createElement(kind, { id })]
    if (kind === 'orderNo' || kind === 'date') fillKeys = []
  }
  const next = addElements(design.value, elements, { groups, fillKeys })
  editor.apply(next)
  editor.select(elements.map(element => element.id))
}

// --- Fill order (plan §5.3.4) ---

const order = computed(() => fillOrderOf(design.value))

function nameOf(key: string): string {
  if (key === PAID_KEY) return t('studio.form.paidPair')
  const group = design.value.groups.find(item => item.id === key)
  if (group) return group.label.en || t('studio.form.types.choice')
  const element = editor.element(key)
  return element ? fieldName(element, t) : key
}

function idsOf(key: string): string[] {
  if (key === PAID_KEY) return design.value.elements.filter(element => element.type === 'paid').map(element => element.id)
  const options = design.value.elements.filter(element => element.type === 'option' && element.group === key)
  return options.length ? options.map(element => element.id) : [key]
}

const dragging = ref<string>()
const dropAt = ref<number>()
function onDrop(index: number) {
  if (dragging.value) editor.apply({ ...design.value, fillOrder: placeInFillOrder(order.value, dragging.value, index) })
  dragging.value = undefined
  dropAt.value = undefined
}
</script>

<template>
  <div class="space-y-5">
    <section class="space-y-2">
      <h2 class="px-1 text-sm font-semibold">
        {{ t('studio.form.ownerFills') }}
      </h2>
      <div class="grid grid-cols-2 gap-2">
        <UButton
          v-for="item in OWNER"
          :key="item.kind"
          :icon="item.icon"
          :label="t(`studio.form.types.${item.kind}`)"
          color="neutral"
          variant="outline"
          class="justify-start"
          @click="add(item.kind)"
        />
      </div>
    </section>

    <section class="space-y-2">
      <h2 class="px-1 text-sm font-semibold">
        {{ t('studio.form.fixed') }}
      </h2>
      <p class="px-1 text-xs text-muted">
        {{ t('studio.form.fixedHint') }}
      </p>
      <div class="grid grid-cols-2 gap-2">
        <UButton
          v-for="item in FIXED"
          :key="item.kind"
          :icon="item.icon"
          :label="t(`studio.form.types.${item.kind}`)"
          color="neutral"
          variant="outline"
          class="justify-start"
          :disabled="has(item.kind as ElementType)"
          @click="add(item.kind)"
        />
      </div>
    </section>

    <section class="space-y-2">
      <h2 class="px-1 text-sm font-semibold">
        {{ t('studio.form.fillOrder') }}
      </h2>
      <p class="px-1 text-xs text-muted">
        {{ order.length ? t('studio.form.fillOrderHint') : t('studio.form.noFields') }}
      </p>
      <ol
        class="space-y-0.5"
        data-testid="fill-order"
      >
        <li
          v-for="(key, index) in order"
          :key="key"
          draggable="true"
          class="flex cursor-grab items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-elevated"
          :class="dropAt === index ? 'border-t-2 border-primary' : ''"
          @dragstart="dragging = key"
          @dragover.prevent="dropAt = index"
          @dragleave="dropAt = undefined"
          @drop.prevent="onDrop(index)"
          @click="editor.select(idsOf(key))"
        >
          <span class="w-5 text-right text-xs text-muted tabular-nums">{{ index + 1 }}</span>
          <UIcon
            name="i-lucide-grip-vertical"
            class="size-4 text-muted"
          />
          <span class="truncate">{{ nameOf(key) }}</span>
        </li>
      </ol>
    </section>
  </div>
</template>
