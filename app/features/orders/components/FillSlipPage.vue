<script setup lang="ts">
import type { OrderDetail } from '#shared/contracts/orders'
import type { SlipFill } from '#shared/slip/values'
import { AMOUNT_MAX, checkFill } from '#shared/slip/values'
import { emptyFill, fillData, useSlipText } from '~/features/slip-fill'
import { useShopSettings } from '~/features/shop-settings'
import { useOrderTemplates } from '../composables/useOrderTemplates'
import { carryFill, serverProblems, shopToday, startingTemplate, toCreateRequest } from '../utils/order-form'
import EditableSlip from './EditableSlip.vue'

const { t, te } = useI18n()
const route = useRoute()
const router = useRouter()
const { supportUrl } = useRuntimeConfig().public
const templates = useOrderTemplates()
const settings = useShopSettings()
const slipText = useSlipText()

const selectedId = ref<string>()
watch([() => templates.data.value, () => route.query.template], ([list, requested]) => {
  if (list) selectedId.value = startingTemplate(list, typeof requested === 'string' ? requested : selectedId.value)?.templateId
}, { immediate: true })
const template = computed(() => templates.data.value?.find(item => item.templateId === selectedId.value))
const templateItems = computed(() => (templates.data.value ?? []).map(item => ({ label: item.name, value: item.templateId })))

const fill = ref<SlipFill>(emptyFill())
const showProblems = ref(false)
const serverErrors = ref<Record<string, string>>({})
const slipUpdated = ref(false)
const editor = useTemplateRef('editor')
const problems = computed(() => (template.value && showProblems.value ? checkFill(template.value.design, fill.value) : {}))

watch(() => template.value?.design, (design) => {
  serverErrors.value = {}
  if (design) fill.value = carryFill(fill.value, design)
})
watch(fill, (next, before) => {
  for (const key of Object.keys(serverErrors.value)) {
    const changed = key === 'phone' ? next.phone !== before.phone : key === 'amount' ? next.amount !== before.amount : next.values[key] !== before.values[key]
    if (changed) serverErrors.value = Object.fromEntries(Object.entries(serverErrors.value).filter(([item]) => item !== key))
  }
})

const shop = computed(() => {
  const value = settings.data.value
  return value && { name: value.name, phone: value.phone, address: value.address, logoImageId: null, currency: value.currency }
})
const draft = computed(() => shop.value && fillData(fill.value, { shop: shop.value, date: shopToday() }))
const previewBody = computed(() => {
  const current = template.value
  if (!current || current.design.html === undefined) return undefined
  const body = toCreateRequest(fill.value, current)
  const { amount } = body
  return { ...body, phone: body.phone.slice(0, 30), amount: amount !== null && (amount < 0 || amount > AMOUNT_MAX) ? null : amount }
})
const imageHref = (id: string) => `/api/shop/templates/${selectedId.value}/images/${id}`

const submissionKey = crypto.randomUUID()
const saved = ref(false)
const save = useMutation((body: ReturnType<typeof toCreateRequest>) => apiFetch<OrderDetail>('/shop/orders', {
  method: 'POST',
  body,
  headers: { 'Idempotency-Key': submissionKey },
}), { inline: true, invalidate: ['orders'] })
const dirty = computed(() => !saved.value && !save.pending.value && (Object.keys(fill.value.values).length > 0 || fill.value.phone.trim() !== '' || fill.value.amount !== null || fill.value.paid))
useUnsavedChanges(() => dirty.value)

const failure = computed(() => {
  const error = save.error.value
  if (!error || error.code === 'TEMPLATE_CHANGED' || error.code === 'SLIP_VALUES_INVALID') return undefined
  return errorText(error, t, te)
})
const saveError = useTemplateRef('saveError')
watch(failure, (message) => {
  if (message) saveError.value?.$el.focus()
}, { flush: 'post' })

async function submit() {
  const current = template.value
  if (!current || save.pending.value || saved.value) return
  showProblems.value = true
  if (Object.keys(problems.value).length || Object.keys(serverErrors.value).length) {
    await nextTick()
    editor.value?.focusFirstProblem()
    return
  }
  slipUpdated.value = false
  const result = await save.execute(toCreateRequest(fill.value, current))
  if (result.ok) {
    saved.value = true
    await router.replace(`/orders/${result.data.id}`)
  }
  else if (result.error.code === 'TEMPLATE_CHANGED') {
    await templates.refresh()
    slipUpdated.value = true
  }
  else if (result.error.code === 'SLIP_VALUES_INVALID') {
    serverErrors.value = serverProblems(result.error.fieldErrors)
    await nextTick()
    editor.value?.focusFirstProblem()
  }
}

const needsFont = computed(() => !!template.value && template.value.design.html === undefined)
const ready = computed(() => templates.data.value && settings.data.value && (!needsFont.value || slipText.text.value))
const loadError = computed(() => templates.error.value ?? settings.error.value ?? (needsFont.value && slipText.failed.value ? new Error('fonts') : undefined))
function retryLoad() {
  if (templates.error.value) templates.refresh()
  if (settings.error.value) settings.refresh()
  if (needsFont.value && slipText.failed.value) slipText.reload()
}
</script>

<template>
  <UDashboardPanel id="fill-slip">
    <template #header>
      <UDashboardNavbar
        :toggle="false"
        :title="t('orders.new.title')"
      >
        <template #right>
          <UColorModeButton />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-page space-y-4">
        <PageLoadError
          v-if="loadError"
          :error="loadError"
          @retry="retryLoad"
        />
        <USkeleton
          v-else-if="!ready"
          class="aspect-10/7 w-full"
        />
        <UEmpty
          v-else-if="!templates.data.value?.length"
          icon="i-lucide-file-x"
          :title="t('orders.new.noSlipTitle')"
          :description="t('orders.new.noSlipDescription')"
          :actions="supportUrl ? [{ label: t('more.contactSupport'), icon: 'i-lucide-message-circle', to: supportUrl, target: '_blank', external: true }] : []"
          data-testid="no-slip"
        />
        <template v-else>
          <UAlert
            v-if="failure"
            ref="saveError"
            color="error"
            icon="i-lucide-circle-alert"
            :title="failure"
            tabindex="-1"
            data-testid="save-error"
          />
          <UAlert
            v-if="slipUpdated"
            color="warning"
            variant="subtle"
            :title="t('orders.new.slipUpdated')"
          />
          <USelect
            v-if="templateItems.length > 1"
            v-model="selectedId"
            :items="templateItems"
            :placeholder="t('orders.new.chooseSlip')"
            :aria-label="t('orders.new.slip')"
            :disabled="save.pending.value"
            class="w-full"
            data-testid="slip-select"
          />
          <div
            v-if="template && draft"
            class="space-y-3"
            :inert="save.pending.value"
          >
            <p class="text-sm text-muted">
              {{ t('orders.new.tapField') }}
            </p>
            <EditableSlip
              ref="editor"
              :key="template.versionId"
              v-model="fill"
              :design="template.design"
              :data="draft"
              :text="slipText.text.value ?? undefined"
              :request="previewBody"
              :image-href="imageHref"
              :problems="problems"
              :server-errors="serverErrors"
            />
          </div>
        </template>

        <!--
          Save above the tab bar. Sticky offsets count from inside the body's bottom padding, which
          already clears the tab bar plus 1rem (tailwind.css), so -1rem puts the bar right on it.
        -->
        <div
          v-if="ready && template"
          class="sticky -bottom-4 z-10 bg-default py-2"
        >
          <UButton
            :label="t('orders.new.save')"
            icon="i-lucide-check"
            block
            :loading="save.pending.value"
            data-testid="save-slip"
            @click="submit"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
