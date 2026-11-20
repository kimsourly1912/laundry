<script setup lang="ts">
import type { OrderPreviewInput, PaperDraft, PaperFieldBox } from '#shared/contracts/orders'
import type { SlipData, SlipDesign } from '#shared/contracts/slip-design'
import { fieldPlaceholder, usedPlaceholders } from '#shared/slip/checks'
import type { SlipText } from '#shared/slip/text'
import type { FillProblems, SlipFill } from '#shared/slip/values'
import { fillSteps, problemKey, SlipSvg, stepOf } from '~/features/slip-fill'
import type { FillStep } from '~/features/slip-fill'
import SlipFieldEditor from './SlipFieldEditor.vue'

const props = defineProps<{
  design: SlipDesign
  data: SlipData
  text?: SlipText
  imageHref: (id: string) => string
  request?: OrderPreviewInput
  problems: FillProblems
  serverErrors: Record<string, string>
}>()

const fill = defineModel<SlipFill>({ required: true })
const { t } = useI18n()
const selectedKey = ref<string>()
const form = useTemplateRef('form')
const retry = ref(0)
const draft = shallowRef<{ url: string, fields: PaperFieldBox[] }>()
const error = shallowRef<unknown>()
const steps = computed(() => fillSteps(props.design))

if (import.meta.client) {
  watch([() => props.request, retry], ([body], _, onCleanup) => {
    if (!body) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const result = await apiFetch<PaperDraft>('/shop/orders/preview', { method: 'POST', body, signal: controller.signal })
        if (controller.signal.aborted) return
        if (draft.value) URL.revokeObjectURL(draft.value.url)
        draft.value = { url: URL.createObjectURL(new Blob([result.svg], { type: 'image/svg+xml' })), fields: result.fields }
        error.value = undefined
      }
      catch (cause) {
        if (!controller.signal.aborted) error.value = cause
      }
    }, draft.value ? 200 : 0)
    onCleanup(() => {
      clearTimeout(timer)
      controller.abort()
    })
  }, { immediate: true })
  onBeforeUnmount(() => {
    if (draft.value) URL.revokeObjectURL(draft.value.url)
  })
}

const fieldBoxes = computed(() => {
  const artwork = props.design.elements.flatMap((element) => {
    const step = steps.value[stepOf(steps.value, element)]
    return step ? [{ key: step.key, left: element.x, top: element.y, width: element.w, height: element.h }] : []
  })
  const boxes = props.request ? draft.value?.fields ?? [] : artwork
  return boxes.flatMap((box) => {
    const step = steps.value.find(item => item.key === box.key || problemKey(item) === box.key)
    if (!step) return []
    const left = Math.max(0, box.left)
    const top = Math.max(0, box.top)
    const width = Math.min(box.width + box.left, props.design.width) - left
    const height = Math.min(box.height + box.top, props.design.height) - top
    return width > 0 && height > 0 ? [{ key: step.key, left, top, width, height, step }] : []
  })
})

function labelOf(step: FillStep): string {
  if (step.kind === 'paid') return t('orders.new.paymentStatus')
  const label = step.kind === 'choice'
    ? props.design.groups.find(group => group.id === step.key)?.label
    : 'label' in step.element ? step.element.label : ''
  return label?.trim() || t('slipFill.untitled')
}

async function selectField(key: string) {
  selectedKey.value = key
  await nextTick()
  await form.value?.focusField()
}

function tapField(step: FillStep) {
  if (step.kind === 'checkbox') {
    fill.value = { ...fill.value, values: { ...fill.value.values, [step.key]: fill.value.values[step.key] !== true } }
    selectedKey.value = undefined
    return
  }
  void selectField(step.key)
}

const used = computed(() => props.request ? usedPlaceholders(props.design) : undefined)
const additionalFields = computed(() => steps.value
  .filter((step) => {
    if (fieldBoxes.value.some(box => box.key === step.key)) return false
    if (!used.value) return true
    if (step.kind === 'paid') return used.value.has('order.paymentStatus')
    if (step.kind === 'choice') return used.value.has('fields.' + step.key) || props.design.groups.some(group => group.id === step.key && group.required)
    return used.value.has(fieldPlaceholder(step.element)) || used.value.has('fields.' + step.key)
      || ('required' in step.element && step.element.required)
      || ('portalOnly' in step.element && step.element.portalOnly)
  })
  .map(step => ({ label: labelOf(step), value: step.key })))

function hasProblem(step: FillStep) {
  const key = problemKey(step)
  return Boolean(props.problems[key] || props.serverErrors[key])
}

function focusFirstProblem() {
  const first = steps.value.find(hasProblem)
  if (first) void selectField(first.key)
}

defineExpose({ focusFirstProblem })
</script>

<template>
  <div class="space-y-4">
    <PageLoadError
      v-if="error"
      :error="error"
      @retry="retry++"
    />
    <div
      class="relative mx-auto w-full rounded-sm bg-white shadow-sm ring-1 ring-default"
      :style="{ aspectRatio: `${design.width} / ${design.height}` }"
      data-testid="fill-slip"
    >
      <img
        v-if="draft"
        :src="draft.url"
        :alt="t('orders.slip.label')"
        class="size-full"
        data-testid="draft-artwork"
      >
      <USkeleton
        v-else-if="request"
        class="size-full"
      />
      <SlipSvg
        v-else-if="text"
        :design="design"
        :data="data"
        :text="text"
        :image-href="imageHref"
        id-prefix="draft-slip"
      />
      <button
        v-for="(box, index) in fieldBoxes"
        :key="`${box.key}-${index}`"
        type="button"
        class="absolute z-10 min-h-5 min-w-5 rounded-sm bg-primary/5 outline-offset-2 hover:bg-primary/15 focus-visible:outline-2 focus-visible:outline-primary"
        :class="hasProblem(box.step) ? 'ring-2 ring-error' : selectedKey === box.key ? 'ring-2 ring-primary' : 'ring-1 ring-primary/45'"
        :style="{
          left: `${box.left / design.width * 100}%`,
          top: `${box.top / design.height * 100}%`,
          width: `${box.width / design.width * 100}%`,
          height: `${box.height / design.height * 100}%`,
        }"
        :aria-label="labelOf(box.step)"
        :aria-pressed="box.step.kind === 'checkbox' ? fill.values[box.key] === true : undefined"
        :data-testid="`fill-box-${box.key}`"
        @click="tapField(box.step)"
      />
    </div>
    <USelect
      v-if="additionalFields.length && (!request || draft || error)"
      :items="additionalFields"
      :placeholder="t('orders.new.otherFields')"
      :aria-label="t('orders.new.otherFields')"
      class="w-full"
      @update:model-value="selectField"
    />
    <SlipFieldEditor
      v-if="selectedKey"
      ref="form"
      :key="selectedKey"
      v-model="fill"
      :selected-key="selectedKey"
      :design="design"
      :currency="data.shop.currency"
      :problems="problems"
      :server-errors="serverErrors"
    />
  </div>
</template>
