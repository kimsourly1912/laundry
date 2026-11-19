<script setup lang="ts">
/**
 * New order's fields (implementation guide → sheet 01): every field of the paper slip as a row to
 * fill directly, in the slip's fill order (plan §5.3.4), with the platform's own labels (D36).
 * Counts have − and + beside a box that takes the numeric keypad; the amount is typed by hand on
 * a free-entry slip. Problems show under their field once the owner asks to preview.
 */
import type { SlipDesign, SlipElement, SlipShop } from '#shared/contracts/slip-design'
import type { FillProblems, SlipFill } from '#shared/slip/values'
import { fillSteps, problemKey, problemMessage, SlipCountInput } from '~/features/slip-fill'
import type { FillStep } from '~/features/slip-fill'

const props = defineProps<{
  design: SlipDesign
  currency: SlipShop['currency']
  /** Problems to show (empty until the owner asks to preview). */
  problems: FillProblems
  /** The server's own words for a field it refused, by the same keys. */
  serverErrors: Record<string, string>
  /** D39: the shop's prices by key, for a slip whose counts are linked to them; the amount is then their total. */
  prices?: ReadonlyMap<string, { label: string, unit: 'piece' | 'kg', price: number }>
  /** The itemized total (minor units), shown in place of a typed amount. */
  total?: number | null
}>()
const fill = defineModel<SlipFill>({ required: true })

const { t } = useI18n()
const { can } = useSession()
const steps = computed(() => fillSteps(props.design))

function labelOf(step: FillStep): string {
  if (step.kind === 'paid') return t('slipFill.paidQuestion')
  const label = step.kind === 'choice'
    ? props.design.groups.find(group => group.id === step.key)?.label
    : 'label' in step.element ? step.element.label : undefined
  return label?.trim() || t('slipFill.untitled')
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

/** A count or weight linked to a key the shop hasn't priced yet (D43): it can't be filled, since the server would refuse it. */
function unpriced(step: FillStep): boolean {
  if (step.kind !== 'number' || step.element.type !== 'number' || !step.element.priceKey || !props.prices) return false
  return !props.prices.has(step.element.priceKey)
}

/** "2,000៛ each" or "3,000៛ per kg" under a count linked to a price (D39); a missing price says who sets it (D43). */
function priceHint(step: FillStep): string | undefined {
  if (step.kind !== 'number' || step.element.type !== 'number' || !step.element.priceKey || !props.prices) return undefined
  const item = props.prices.get(step.element.priceKey)
  if (!item) return t(can('price:write') ? 'orders.form.noPriceOwner' : 'orders.form.noPrice')
  return t(item.unit === 'kg' ? 'orders.form.perKg' : 'orders.form.each', { price: formatMoney(item.price, props.currency) })
}

/** Focuses the first field with a problem (after Preview found some). */
function focusFirstProblem() {
  const first = steps.value.find(step => errorOf(step))
  if (!first) return
  const field = document.querySelector<HTMLElement>(`[data-field="${first.key}"]`)
  field?.scrollIntoView({ block: 'center' })
  field?.querySelector<HTMLElement>('input, button, [role="radio"]')?.focus({ preventScroll: true })
}

defineExpose({ focusFirstProblem })
</script>

<template>
  <div
    v-if="steps.length"
    class="divide-y divide-default rounded-md border border-default bg-default"
  >
    <div
      v-for="step in steps"
      :key="step.key"
      class="px-4 py-3"
      :data-field="step.key"
    >
      <UFormField
        v-if="step.kind === 'number' && step.element.type === 'number'"
        :label="labelOf(step)"
        :description="priceHint(step)"
        :required="isRequired(step)"
        :error="errorOf(step)"
        orientation="horizontal"
        :ui="{ container: 'shrink-0', label: 'text-base' }"
        class="items-center justify-between gap-3"
      >
        <SlipCountInput
          :model-value="countOf(step.key)"
          :range="step.element"
          :label="labelOf(step)"
          :test-id="`field-${step.key}`"
          :disabled="unpriced(step)"
          @update:model-value="setValue(step.key, $event)"
        />
      </UFormField>

      <UFormField
        v-else-if="step.kind === 'textField'"
        :label="labelOf(step)"
        :required="isRequired(step)"
        :error="errorOf(step)"
        :ui="{ label: 'text-base' }"
      >
        <UInput
          :model-value="textOf(step.key)"
          :maxlength="'maxLength' in step.element ? step.element.maxLength : 200"
          size="xl"
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
          size="xl"
          :ui="{ root: 'py-1', label: 'text-base' }"
          :data-testid="`field-${step.key}`"
          @update:model-value="setValue(step.key, $event === true)"
        />
      </UFormField>

      <UFormField
        v-else-if="step.kind === 'choice'"
        :label="labelOf(step)"
        :required="isRequired(step)"
        :error="errorOf(step)"
        :ui="{ label: 'text-base' }"
      >
        <URadioGroup
          :model-value="typeof fill.values[step.key] === 'string' ? String(fill.values[step.key]) : undefined"
          :items="step.options.map(option => ({ label: optionLabel(option), value: option.id }))"
          variant="card"
          size="xl"
          :ui="{ fieldset: 'gap-2' }"
          :data-testid="`field-${step.key}`"
          @update:model-value="setValue(step.key, String($event))"
        />
      </UFormField>

      <UFormField
        v-else-if="step.kind === 'phone'"
        :label="labelOf(step)"
        :required="isRequired(step)"
        :error="errorOf(step)"
        :ui="{ label: 'text-base' }"
      >
        <UInput
          :model-value="fill.phone"
          type="tel"
          inputmode="tel"
          autocomplete="off"
          size="xl"
          class="w-full"
          placeholder="012 345 678"
          data-testid="field-phone"
          @update:model-value="fill = { ...fill, phone: String($event) }"
        />
      </UFormField>

      <UFormField
        v-else-if="step.kind === 'amount'"
        :label="labelOf(step)"
        :required="isRequired(step)"
        :error="errorOf(step)"
        :ui="{ label: 'text-base' }"
      >
        <p
          v-if="total !== undefined && total !== null"
          class="text-2xl font-semibold text-highlighted tabular-nums"
          data-testid="field-total"
        >
          {{ formatMoney(total, currency) }}
          <span class="block text-sm font-normal text-muted">{{ t('orders.form.fromPrices') }}</span>
        </p>
        <UInput
          v-else
          :model-value="amountText"
          inputmode="decimal"
          autocomplete="off"
          size="xl"
          class="w-full"
          data-testid="field-amount"
          @update:model-value="setAmount(String($event))"
        >
          <template #trailing>
            <span class="text-muted">{{ currency === 'KHR' ? '៛' : '$' }}</span>
          </template>
        </UInput>
      </UFormField>

      <UFormField
        v-else-if="step.kind === 'paid'"
        :label="labelOf(step)"
        :ui="{ label: 'text-base' }"
      >
        <URadioGroup
          :model-value="fill.paid ? 'paid' : 'unpaid'"
          :items="[{ label: t('slipFill.notPaid'), value: 'unpaid' }, { label: t('slipFill.paid'), value: 'paid' }]"
          variant="card"
          orientation="horizontal"
          size="xl"
          :ui="{ fieldset: 'gap-2', item: 'flex-1' }"
          data-testid="field-paid"
          @update:model-value="fill = { ...fill, paid: $event === 'paid' }"
        />
      </UFormField>
    </div>
  </div>
  <p
    v-else
    class="text-sm text-muted"
  >
    {{ t('slipFill.nothingToFill') }}
  </p>
</template>
