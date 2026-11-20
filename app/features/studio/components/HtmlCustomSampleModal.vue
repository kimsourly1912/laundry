<script setup lang="ts">
import { CUSTOMER_NAME_MAX } from '#shared/contracts/customers'
import type { SlipDesign, SlipValues } from '#shared/contracts/slip-design'
import type { CustomSample, PreviewHtmlTemplateInput } from '#shared/contracts/templates'
import { customSampleFieldProblems, customSampleFields, sampleOrder } from '#shared/html-slip/sample'
import { AMOUNT_MAX } from '#shared/slip/values'
import { problemMessage, SlipCountInput } from '~/features/slip-fill'
import { useHtmlTemplatePreview } from '../composables/useHtmlTemplatePreview'

const props = defineProps<{ design: SlipDesign, custom?: CustomSample, canPreview: boolean }>()
const emit = defineEmits<{ apply: [sample: CustomSample] }>()
/** Opened by its trigger (the default slot) or by the page, from the Intake fields view. */
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()

const fields = computed(() => customSampleFields(props.design))
const state = reactive<CustomSample>({ customerName: '', amount: null, values: {} })
const amountText = ref('')
const problems = computed(() => customSampleFieldProblems(props.design, state.values))
const amountError = computed(() => state.amount !== null && (state.amount < 0 || state.amount > AMOUNT_MAX)
  ? t('slipFill.problems.invalid')
  : undefined)
const previewInput = computed<PreviewHtmlTemplateInput | undefined>(() => {
  if (!open.value || !props.canPreview || amountError.value || Object.keys(problems.value).length) return
  return {
    design: props.design,
    sample: 'custom',
    custom: { customerName: state.customerName.trim(), amount: state.amount, values: { ...state.values } },
  }
})
const { preview, previewError, previewCurrent, previewLoading, previewUpdating, loadPreview } = useHtmlTemplatePreview({
  input: () => previewInput.value,
  renderImmediatelyOn: () => open.value,
  clearImageWhen: () => !open.value,
})

watch(open, (visible) => {
  if (!visible) return
  const typical = sampleOrder(props.design, { sample: 'typical', date: '' })
  const values = props.custom?.values ?? typical.values
  const invalid = customSampleFieldProblems(props.design, values)
  state.customerName = props.custom?.customerName ?? typical.order.customerName ?? ''
  state.amount = props.custom?.amount ?? null
  amountText.value = state.amount === null ? '' : moneyInput(state.amount, 'KHR')
  state.values = Object.fromEntries(Object.entries(values).filter(([key]) => !Object.hasOwn(invalid, key)))
}, { flush: 'sync' })

function setAmount(text: string) {
  amountText.value = text
  state.amount = text.trim() ? parseMoney(text, 'KHR') ?? -1 : null
}

function setValue(id: string, value: SlipValues[string] | undefined) {
  if (value === undefined || value === false || value === '') {
    state.values = Object.fromEntries(Object.entries(state.values).filter(([key]) => key !== id))
  }
  else state.values[id] = value
}

function fieldError(id: string) {
  const problem = problems.value[id]
  if (!problem) return
  const { key, params } = problemMessage(problem)
  return t(`slipFill.problems.${key}`, params ?? {})
}

function countOf(id: string) {
  const value = state.values[id]
  return typeof value === 'number' ? value : undefined
}

function textOf(id: string) {
  const value = state.values[id]
  return typeof value === 'string' ? value : ''
}

function numberLabel(field: { label: string, unit: string, id: string }) {
  const label = field.label || field.id
  return field.unit ? t('studio.html.customSample.fieldWithUnit', { label, unit: field.unit }) : label
}

function apply() {
  const input = previewInput.value
  if (!previewCurrent.value || input?.sample !== 'custom') return
  emit('apply', input.custom)
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('studio.html.customSample.title')"
    :description="t('studio.html.customSample.description')"
    :ui="{
      content: 'h-dvh w-full max-h-dvh max-w-none rounded-none sm:h-4/5 sm:w-11/12 sm:max-w-5xl sm:rounded-lg',
      body: 'flex min-h-0 flex-col overflow-hidden p-0 sm:grid sm:grid-cols-2 sm:p-0',
      footer: 'justify-end',
    }"
  >
    <slot />

    <template #body>
      <div class="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain sm:order-first">
        <div class="divide-y divide-default">
          <div class="px-4 py-3 sm:px-6">
            <UFormField :label="t('studio.html.customSample.customerName')">
              <UInput
                v-model="state.customerName"
                :maxlength="CUSTOMER_NAME_MAX"
                autocomplete="off"
                class="w-full"
              />
            </UFormField>
          </div>
          <div
            v-for="field in fields"
            :key="field.id"
            class="px-4 py-3 sm:px-6"
          >
            <UFormField
              v-if="field.type === 'number'"
              :label="numberLabel(field)"
              :error="fieldError(field.id)"
              orientation="horizontal"
              :ui="{ container: 'shrink-0', root: 'flex-wrap items-center justify-between gap-2', label: 'wrap-break-word' }"
            >
              <SlipCountInput
                :model-value="countOf(field.id)"
                :range="field"
                :label="numberLabel(field)"
                @update:model-value="setValue(field.id, $event)"
              />
            </UFormField>
            <UFormField
              v-else-if="field.type === 'textField'"
              :label="field.label || field.id"
              :error="fieldError(field.id)"
            >
              <UInput
                :model-value="textOf(field.id)"
                :maxlength="field.maxLength"
                autocomplete="off"
                class="w-full"
                @update:model-value="setValue(field.id, String($event))"
              />
            </UFormField>
            <UFormField
              v-else
              :error="fieldError(field.id)"
            >
              <UCheckbox
                :model-value="state.values[field.id] === true"
                :label="field.label || field.id"
                @update:model-value="setValue(field.id, $event === true)"
              />
            </UFormField>
          </div>
          <div class="px-4 py-3 sm:px-6">
            <UFormField
              :label="t('studio.html.customSample.total')"
              :description="t('studio.html.customSample.totalHint')"
              :error="amountError"
            >
              <UInput
                :model-value="amountText"
                inputmode="numeric"
                autocomplete="off"
                class="w-full"
                @update:model-value="setAmount(String($event))"
              >
                <template #trailing>
                  <span class="text-muted">{{ t('studio.html.customSample.currency') }}</span>
                </template>
              </UInput>
            </UFormField>
          </div>
        </div>
      </div>

      <section
        aria-labelledby="html-custom-preview-title"
        class="order-first flex h-2/5 min-h-0 min-w-0 flex-col border-b border-default bg-elevated/50 sm:order-none sm:h-auto sm:border-b-0 sm:border-s"
      >
        <div class="flex min-h-9 flex-wrap items-center justify-between gap-x-3 px-4 py-1.5 sm:px-6">
          <h3
            id="html-custom-preview-title"
            class="text-sm font-medium text-highlighted"
          >
            {{ t('studio.html.customSample.live') }}
          </h3>
          <span
            role="status"
            class="text-xs"
            :class="preview && !previewCurrent && !previewLoading ? 'text-warning' : 'text-muted'"
          >
            <template v-if="previewLoading && (!preview || previewUpdating)">
              {{ t('studio.html.previewUpdating') }}
            </template>
            <template v-else-if="preview && !previewCurrent && !previewLoading">
              {{ t('studio.html.previewStale') }}
            </template>
            <template v-else-if="previewCurrent">
              <span class="sr-only">{{ t('studio.html.customSample.updated') }}</span>
            </template>
          </span>
        </div>
        <div
          class="relative min-h-0 flex-1"
          :aria-busy="previewLoading"
          data-testid="html-custom-preview"
        >
          <div class="absolute inset-0 flex items-center justify-center p-2 sm:p-4">
            <img
              v-if="preview"
              :src="preview.url"
              :width="preview.width"
              :height="preview.height"
              :alt="t('studio.html.previewAlt')"
              class="block h-auto max-h-full w-auto max-w-full bg-white shadow-sm"
              draggable="false"
            >
            <p
              v-else-if="!canPreview"
              class="text-center text-sm text-muted"
            >
              {{ t('studio.html.previewInvalid') }}
            </p>
          </div>
          <div
            v-if="previewError"
            class="absolute inset-x-2 bottom-2"
          >
            <PageLoadError
              :error="previewError"
              :loading="previewLoading"
              @retry="loadPreview"
            />
          </div>
        </div>
      </section>
    </template>

    <template #footer>
      <UButton
        :label="t('common.actions.cancel')"
        color="neutral"
        variant="outline"
        @click="open = false"
      />
      <UButton
        :label="t('studio.html.customSample.apply')"
        :disabled="!previewCurrent"
        @click="apply"
      />
    </template>
  </UModal>
</template>
