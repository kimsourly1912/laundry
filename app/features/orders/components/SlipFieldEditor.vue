<script setup lang="ts">
import type { SlipDesign, SlipElement, SlipShop } from '#shared/contracts/slip-design'
import type { FillProblems, SlipFill } from '#shared/slip/values'
import { fillSteps, problemKey, problemMessage, SlipCountInput } from '~/features/slip-fill'
import type { FillStep } from '~/features/slip-fill'

const props = defineProps<{
  design: SlipDesign
  selectedKey: string
  currency: SlipShop['currency']
  /** Problems to show (empty until the owner tries to save). */
  problems: FillProblems
  /** The server's own words for a field it refused, by the same keys. */
  serverErrors: Record<string, string>
}>()
const fill = defineModel<SlipFill>({ required: true })

const { t } = useI18n()
const steps = computed(() => fillSteps(props.design))
const fields = useTemplateRef('fields')

function labelOf(step: FillStep): string {
  const label = step.kind === 'choice'
    ? props.design.groups.find(group => group.id === step.key)?.label
    : 'element' in step && 'label' in step.element ? step.element.label : undefined
  const name = label?.trim() || t('slipFill.untitled')
  if (step.kind === 'number' && step.element.type === 'number' && step.element.unit) {
    return t('orders.new.quantityWithUnit', { label: name, unit: step.element.unit })
  }
  return name
}

function isRequired(step: FillStep): boolean {
  if (step.kind === 'paid') return false
  if (step.kind === 'choice') return props.design.groups.find(group => group.id === step.key)?.required ?? false
  return 'required' in step.element && step.element.required
}

function errorOf(step: FillStep): string | undefined {
  const key = problemKey(step)
  const problem = props.problems[key]
  if (problem) {
    const { key: message, params } = problemMessage(problem)
    return t(`slipFill.problems.${message}`, params ?? {})
  }
  return props.serverErrors[key]
}

function setValue(key: string, value: number | string | boolean | undefined) {
  const rest = Object.fromEntries(Object.entries(fill.value.values).filter(([item]) => item !== key))
  const empty = value === undefined || value === '' || value === false
  fill.value = { ...fill.value, values: empty ? rest : { ...rest, [key]: value } }
}

function countOf(key: string): number | undefined {
  const value = fill.value.values[key]
  return typeof value === 'number' ? value : undefined
}

const textOf = (key: string) => {
  const value = fill.value.values[key]
  return typeof value === 'string' ? value : ''
}
const optionLabel = (option: SlipElement) => ('label' in option && option.label.trim()) || t('slipFill.untitled')

// The amount as typed, so `12.` or `13,500` stay as the owner types them; the fill holds minor units (-1: not an amount).
const amountText = ref('')
watch(() => fill.value.amount, (amount) => {
  if (parseMoney(amountText.value, props.currency) !== amount) amountText.value = amount === null ? '' : moneyInput(amount, props.currency)
}, { immediate: true })
function setAmount(text: string) {
  amountText.value = text
  fill.value = { ...fill.value, amount: text.trim() ? parseMoney(text, props.currency) ?? -1 : null }
}

async function focusField() {
  await nextTick()
  const field = fields.value?.querySelector<HTMLElement>('input:not([type="hidden"]), [role="checkbox"], [role="radio"]')
  field?.focus({ preventScroll: true })
  // The whole card, clear of the page's Save bar (its scroll margin).
  fields.value?.scrollIntoView({ block: 'nearest' })
}

defineExpose({ focusField })
</script>

<template>
  <div
    ref="fields"
    class="scroll-mb-16 rounded-lg border border-default bg-default p-4"
  >
    <div
      v-for="step in steps.filter(item => item.key === selectedKey)"
      :key="step.key"
      :data-field="step.key"
    >
      <UFormField
        v-if="step.kind === 'number' && step.element.type === 'number'"
        :label="labelOf(step)"
        :required="isRequired(step)"
        :error="errorOf(step)"
        orientation="horizontal"
        class="flex-wrap items-center justify-between gap-3 rounded-lg bg-elevated/50 p-3 wrap-anywhere"
      >
        <SlipCountInput
          :model-value="countOf(step.key)"
          :range="step.element"
          :label="labelOf(step)"
          :required="isRequired(step)"
          :test-id="`field-${step.key}`"
          @update:model-value="setValue(step.key, $event)"
        />
      </UFormField>

      <UFormField
        v-else-if="step.kind === 'textField'"
        :label="labelOf(step)"
        :required="isRequired(step)"
        :error="errorOf(step)"
      >
        <UInput
          :model-value="textOf(step.key)"
          :maxlength="'maxLength' in step.element ? step.element.maxLength : 200"
          class="w-full"
          autocomplete="off"
          :data-testid="`field-${step.key}`"
          @update:model-value="setValue(step.key, String($event))"
        />
      </UFormField>

      <UFormField
        v-else-if="step.kind === 'checkbox'"
        :error="errorOf(step)"
      >
        <UCheckbox
          :model-value="fill.values[step.key] === true"
          :label="labelOf(step)"
          :required="isRequired(step)"
          variant="card"
          :data-testid="`field-${step.key}`"
          @update:model-value="setValue(step.key, $event === true)"
        />
      </UFormField>

      <UFormField
        v-else-if="step.kind === 'choice'"
        :error="errorOf(step)"
      >
        <URadioGroup
          :required="isRequired(step)"
          :model-value="typeof fill.values[step.key] === 'string' ? String(fill.values[step.key]) : undefined"
          :items="step.options.map(option => ({ label: optionLabel(option), value: option.id }))"
          variant="card"
          :data-testid="`field-${step.key}`"
          @update:model-value="setValue(step.key, String($event))"
        >
          <template #legend>
            {{ labelOf(step) }}
            <span
              v-if="isRequired(step)"
              class="text-error"
              aria-hidden="true"
            >*</span>
          </template>
        </URadioGroup>
      </UFormField>

      <UFormField
        v-else-if="step.kind === 'phone'"
        :label="labelOf(step)"
        :required="isRequired(step)"
        :error="errorOf(step)"
        :hint="isRequired(step) ? undefined : t('common.optional')"
      >
        <UInput
          :model-value="fill.phone"
          type="tel"
          inputmode="tel"
          maxlength="30"
          autocomplete="off"
          class="w-full"
          :placeholder="t('orders.new.phoneExample')"
          data-testid="field-phone"
          @update:model-value="fill = { ...fill, phone: String($event) }"
        />
      </UFormField>

      <UFormField
        v-else-if="step.kind === 'amount'"
        :label="labelOf(step)"
        :required="isRequired(step)"
        :error="errorOf(step)"
      >
        <UInput
          :model-value="amountText"
          :inputmode="currency === 'KHR' ? 'numeric' : 'decimal'"
          :placeholder="t(currency === 'KHR' ? 'orders.new.amountExampleKhr' : 'orders.new.amountExampleUsd')"
          autocomplete="off"
          class="w-full tabular-nums"
          data-testid="field-amount"
          @update:model-value="setAmount(String($event))"
        >
          <template #trailing>
            <span class="text-muted">{{ currency === 'KHR' ? '៛' : '$' }}</span>
          </template>
        </UInput>
      </UFormField>

      <URadioGroup
        v-else-if="step.kind === 'paid'"
        :legend="t('orders.new.paymentStatus')"
        :model-value="fill.paid ? 'paid' : 'unpaid'"
        :items="[{ label: t('slipFill.notPaid'), value: 'unpaid' }, { label: t('slipFill.paid'), value: 'paid' }]"
        variant="card"
        orientation="horizontal"
        class="[&_[data-slot=item]]:flex-1"
        data-testid="field-paid"
        @update:model-value="fill = { ...fill, paid: $event === 'paid' }"
      />
    </div>
  </div>
</template>
