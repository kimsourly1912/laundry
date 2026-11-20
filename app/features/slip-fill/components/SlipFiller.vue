<script setup lang="ts">
/**
 * The owner's slip form (plan §3 step 4, §5.4.5): the slip as it will be sent, with its boxes to tap;
 * the field being filled below it, and Back / Next through the fill order. Labels are the platform's
 * own text, Khmer or English (D36). The studio's Try it shows this same component.
 */
import type { SlipDesign, SlipShop } from '#shared/contracts/slip-design'
import type { SlipText } from '#shared/slip/text'
import type { FillProblem, FillProblems, SlipFill } from '#shared/slip/values'
import { checkFill } from '#shared/slip/values'
import { fillData, fillSteps, problemKey, problemMessage, stepOf } from '../utils/fill'
import type { FillStep } from '../utils/fill'
import { SlipSvg } from './slip-svg'

const props = defineProps<{
  design: SlipDesign
  shop: SlipShop
  text: SlipText
  /** The shop's day, drawn in the Date field. */
  date: string | null
  imageHref?: (imageId: string) => string
}>()
const fill = defineModel<SlipFill>({ required: true })

const { t } = useI18n()

const steps = computed(() => fillSteps(props.design))
const current = ref(0)
const step = computed<FillStep | undefined>(() => steps.value[current.value])
const showProblems = ref(false)
const problems = computed<FillProblems>(() => checkFill(props.design, fill.value))
const problem = computed<FillProblem | undefined>(() => (step.value && showProblems.value ? problems.value[problemKey(step.value)] : undefined))
const data = computed(() => fillData(fill.value, { shop: props.shop, date: props.date }))

function labelOf(label: string | undefined): string {
  return label?.trim() || t('slipFill.untitled')
}

const stepLabel = computed(() => {
  const value = step.value
  if (!value) return ''
  if (value.kind === 'paid') return t('slipFill.paidQuestion')
  if (value.kind === 'choice') return labelOf(props.design.groups.find(group => group.id === value.key)?.label)
  return labelOf('label' in value.element ? value.element.label : undefined)
})

const required = computed(() => {
  const value = step.value
  if (!value || value.kind === 'paid') return false
  if (value.kind === 'choice') return props.design.groups.find(group => group.id === value.key)?.required ?? false
  return 'required' in value.element && value.element.required
})

function setValue(key: string, value: number | string | boolean | undefined) {
  const rest = Object.fromEntries(Object.entries(fill.value.values).filter(([item]) => item !== key))
  const empty = value === undefined || value === '' || value === false
  fill.value = { ...fill.value, values: empty ? rest : { ...rest, [key]: value } }
}

// --- The field being filled ---

const numberValue = computed(() => {
  const value = step.value?.kind === 'number' ? fill.value.values[step.value.key] : undefined
  return typeof value === 'number' ? value : null
})

function setNumber(value: number | null | undefined) {
  if (step.value?.kind !== 'number') return
  setValue(step.value.key, typeof value === 'number' && Number.isFinite(value) ? value : undefined)
}

const textValue = computed(() => {
  const value = step.value?.kind === 'textField' ? fill.value.values[step.value.key] : undefined
  return typeof value === 'string' ? value : ''
})

const amountText = ref('')
watch(() => fill.value.amount, (amount) => {
  if (parseMoney(amountText.value, props.shop.currency) !== amount) amountText.value = amount === null ? '' : moneyInput(amount, props.shop.currency)
}, { immediate: true })
function setAmount(text: string) {
  amountText.value = text
  fill.value = { ...fill.value, amount: text.trim() ? parseMoney(text, props.shop.currency) ?? -1 : null }
}

// --- Moving between fields ---

function go(index: number) {
  current.value = Math.max(0, Math.min(steps.value.length - 1, index))
}

/** A tap on a box of the slip: a checkbox toggles, an option or a paid spot is chosen, others open. */
function tapElement(id: string) {
  const element = props.design.elements.find(item => item.id === id)
  if (!element) return
  const index = stepOf(steps.value, element)
  if (index < 0) return
  go(index)
  if (element.type === 'checkbox') setValue(element.id, fill.value.values[element.id] !== true)
  else if (element.type === 'option') setValue(element.group, element.id)
  else if (element.type === 'paid') fill.value = { ...fill.value, paid: element.value === 'paid' }
}

const tappable = computed(() => props.design.elements.filter(element => stepOf(steps.value, element) >= 0))
const selectedKey = computed(() => step.value?.key)

/** Shows every problem and goes to the first; `true` when the slip can be saved. */
function validate(): boolean {
  showProblems.value = true
  const keys = Object.keys(problems.value)
  if (!keys.length) return true
  const index = steps.value.findIndex(item => keys.includes(problemKey(item)))
  if (index >= 0) go(index)
  return false
}

function problemText(value: FillProblem): string {
  const { key, params } = problemMessage(value)
  return t(`slipFill.problems.${key}`, params ?? {})
}

defineExpose({ validate })
</script>

<template>
  <div class="flex flex-col gap-3">
    <div
      class="relative w-full bg-white shadow"
      :style="{ aspectRatio: `${design.width} / ${design.height}` }"
      data-testid="fill-slip"
    >
      <SlipSvg
        :design="design"
        :data="data"
        :text="text"
        :image-href="imageHref"
        id-prefix="fill-"
      />
      <button
        v-for="element in tappable"
        :key="element.id"
        type="button"
        class="absolute rounded-sm"
        :class="(element.type === 'option' ? element.group : element.type === 'paid' ? 'paid' : element.id) === selectedKey ? 'ring-2 ring-primary' : 'ring-1 ring-primary/30'"
        :style="{
          left: `${element.x / design.width * 100}%`,
          top: `${element.y / design.height * 100}%`,
          width: `${element.w / design.width * 100}%`,
          height: `${element.h / design.height * 100}%`,
        }"
        :aria-label="'label' in element ? labelOf(element.label) : element.type"
        :data-testid="`fill-box-${element.id}`"
        @click="tapElement(element.id)"
      />
    </div>

    <div
      v-if="step"
      class="space-y-2 rounded-lg border border-default bg-default p-3"
      data-testid="fill-step"
    >
      <div class="flex items-baseline justify-between gap-2">
        <p class="font-medium">
          {{ stepLabel }}<span
            v-if="required"
            class="text-error"
            aria-hidden="true"
          > *</span>
        </p>
        <span class="text-xs text-muted tabular-nums">{{ t('slipFill.position', { n: current + 1, total: steps.length }) }}</span>
      </div>

      <UInputNumber
        v-if="step.kind === 'number'"
        :model-value="numberValue"
        :min="'min' in step.element ? step.element.min : undefined"
        :max="'max' in step.element ? step.element.max : undefined"
        :step="1"
        :step-snapping="false"
        :format-options="{ maximumFractionDigits: 'decimals' in step.element ? step.element.decimals : 0, useGrouping: false }"
        class="w-full"
        :aria-label="stepLabel"
        data-testid="fill-number"
        @update:model-value="setNumber($event)"
      />
      <UInput
        v-else-if="step.kind === 'textField'"
        :model-value="textValue"
        :maxlength="'maxLength' in step.element ? step.element.maxLength : 200"
        class="w-full"
        :aria-label="stepLabel"
        data-testid="fill-text"
        @update:model-value="setValue(step.key, String($event))"
      />
      <USwitch
        v-else-if="step.kind === 'checkbox'"
        :model-value="fill.values[step.key] === true"
        :label="t('slipFill.ticked')"
        @update:model-value="setValue(step.key, Boolean($event))"
      />
      <div
        v-else-if="step.kind === 'choice'"
        class="flex flex-wrap gap-2"
      >
        <UButton
          v-for="option in step.options"
          :key="option.id"
          :label="'label' in option ? labelOf(option.label) : option.type"
          :variant="fill.values[step.key] === option.id ? 'solid' : 'outline'"
          :aria-pressed="fill.values[step.key] === option.id"
          @click="setValue(step.key, fill.values[step.key] === option.id ? undefined : option.id)"
        />
      </div>
      <UInput
        v-else-if="step.kind === 'phone'"
        :model-value="fill.phone"
        type="tel"
        inputmode="tel"
        autocomplete="off"
        class="w-full"
        placeholder="012 345 678"
        :aria-label="stepLabel"
        data-testid="fill-phone"
        @update:model-value="fill = { ...fill, phone: String($event) }"
      />
      <UInput
        v-else-if="step.kind === 'amount'"
        :model-value="amountText"
        inputmode="decimal"
        class="w-full"
        :aria-label="stepLabel"
        data-testid="fill-amount"
        @update:model-value="setAmount(String($event))"
      >
        <template #trailing>
          <span class="text-muted">{{ shop.currency === 'KHR' ? '៛' : '$' }}</span>
        </template>
      </UInput>
      <div
        v-else-if="step.kind === 'paid'"
        class="flex gap-2"
      >
        <UButton
          :label="t('slipFill.paid')"
          :variant="fill.paid ? 'solid' : 'outline'"
          :aria-pressed="fill.paid"
          @click="fill = { ...fill, paid: true }"
        />
        <UButton
          :label="t('slipFill.notPaid')"
          color="neutral"
          :variant="fill.paid ? 'outline' : 'solid'"
          :aria-pressed="!fill.paid"
          @click="fill = { ...fill, paid: false }"
        />
      </div>

      <p
        v-if="problem"
        class="text-sm text-error"
        role="alert"
      >
        {{ problemText(problem) }}
      </p>

      <div class="flex justify-between gap-2 pt-1">
        <UButton
          :label="t('slipFill.back')"
          icon="i-lucide-chevron-left"
          color="neutral"
          variant="ghost"
          :disabled="current === 0"
          @click="go(current - 1)"
        />
        <UButton
          :label="t('slipFill.next')"
          trailing-icon="i-lucide-chevron-right"
          color="neutral"
          variant="outline"
          :disabled="current >= steps.length - 1"
          @click="go(current + 1)"
        />
      </div>
    </div>
    <p
      v-else
      class="text-sm text-muted"
    >
      {{ t('slipFill.nothingToFill') }}
    </p>
  </div>
</template>
