<script setup lang="ts">
/**
 * New order (plan §3 steps 4–5; implementation guide → sheets 01, 10, 11): the owner fills the
 * shop's paper slip, previews it, and saves it once. Two steps on one page, so Edit brings back
 * everything entered: the form, and the preview (`?step=preview`, so the phone's Back returns to
 * the form). Previewing creates nothing.
 *
 * Saving sends one `Idempotency-Key` for the whole flow: a double tap or a retry after a lost
 * answer makes one order (architecture → Idempotency). The server sets the number, the day and the
 * version; the order page then shows the saved slip, and prints it for Save & print.
 */
import type { OrderDetail, OrderTemplate } from '#shared/contracts/orders'
import type { PriceItem } from '#shared/contracts/prices'
import { priceLines } from '#shared/pricing'
import { formatPhone } from '#shared/contracts/phone'
import type { SlipShop } from '#shared/contracts/slip-design'
import { checkFill } from '#shared/slip/values'
import type { SlipFill } from '#shared/slip/values'
import { emptyFill, fillData, useSlipText } from '~/features/slip-fill'
import { useShopSettings } from '~/features/shop-settings'
import { CustomerPicker } from '~/features/customers'
import type { CustomerChoice } from '~/features/customers'
import { useOrderTemplates } from '../composables/useOrderTemplates'
import { carryFill, serverProblems, shopToday, startingTemplate, toCreateRequest } from '../utils/order-form'
import OrderForm from './OrderForm.vue'
import SlipView from './SlipView.vue'

const { t, te } = useI18n()
const route = useRoute()
const router = useRouter()
const { supportUrl } = useRuntimeConfig().public

const templates = useOrderTemplates()
const settings = useShopSettings()
const slipText = useSlipText()

// --- The paper slip ---

// `?template=` (Paper slips → Use for a new order) starts on that slip if the shop can use it.
const selectedId = ref<string | undefined>(typeof route.query.template === 'string' ? route.query.template : undefined)
watch(() => templates.data.value, (list) => {
  if (list) selectedId.value = startingTemplate(list, selectedId.value)?.templateId
}, { immediate: true })

// Plan §4: with no default, the owner's choice here becomes the default (remembered for next time).
const { can } = useSession()
const rememberChoice = useMutation((templateId: string) => apiFetch<OrderTemplate[]>(`/shop/templates/${templateId}/default`, { method: 'POST' }), { inline: true })
async function chooseTemplate(templateId: string) {
  selectedId.value = templateId
  const list = templates.data.value
  if (!list || list.some(item => item.isDefault) || !can('template:set-default')) return
  const result = await rememberChoice.execute(templateId)
  // Not remembered (offline): the order still goes on with the choice.
  if (result.ok) templates.data.value = result.data
}
const template = computed(() => templates.data.value?.find(item => item.templateId === selectedId.value))
const templateItems = computed(() => (templates.data.value ?? []).map(item => ({ label: item.name, value: item.templateId })))

// --- What the owner fills ---

const fill = ref<SlipFill>(emptyFill())
// The promised pickup day (D39), optional; the shop's today at the earliest.
const dueDate = ref('')
const today = shopToday()

// D39: a slip whose counts are linked to price keys is itemized: its amount is the price list's total.
const itemized = computed(() => template.value?.design.elements.some(element => element.type === 'number' && Boolean(element.priceKey)) ?? false)
const priceList = useApiQuery('orders:prices', () => (itemized.value ? apiFetch<PriceItem[]>('/shop/prices') : Promise.resolve([] as PriceItem[])), { watch: [itemized] })
const prices = computed(() => new Map((priceList.data.value ?? []).filter(item => item.active).map(item => [item.key, item])))
const quote = computed(() => {
  const design = template.value?.design
  if (!design || !itemized.value) return undefined
  const values = design.elements.flatMap(element => (element.type === 'number' && element.priceKey && typeof fill.value.values[element.id] === 'number' ? [{ fieldId: element.id, key: element.priceKey, value: fill.value.values[element.id] as number }] : []))
  return priceLines(values, prices.value)
})
const hasAmountField = computed(() => template.value?.design.elements.some(element => element.type === 'amount') ?? false)
// The amount follows the total, so the slip draws it and the server checks it is the same.
watch(() => quote.value?.total, (total) => {
  if (total !== undefined && hasAmountField.value && fill.value.amount !== total) fill.value = { ...fill.value, amount: total }
})
/** The server's total differed from the one shown: a price changed. */
const quoteChanged = ref(false)

// The order's customer (D39), optional. Picking one fills the slip's phone box when it is empty.
const customer = ref<CustomerChoice | null>(null)
watch(customer, (picked) => {
  const hasPhone = template.value?.design.elements.some(element => element.type === 'phone')
  if (picked?.phone && hasPhone && !fill.value.phone.trim()) fill.value = { ...fill.value, phone: formatPhone(picked.phone) }
})
const showProblems = ref(false)
const serverErrors = ref<Record<string, string>>({})
const problems = computed(() => (template.value && showProblems.value ? checkFill(template.value.design, fill.value) : {}))
/** The platform published the slip again while the owner was filling it. */
const slipUpdated = ref(false)

// A slip changed under the owner (another one chosen, or a new version): keep what still fits.
watch(() => template.value?.design, (design) => {
  if (design) fill.value = carryFill(fill.value, design)
})
// A server refusal of a field goes once the owner changes that field.
watch(fill, (next, before) => {
  for (const key of Object.keys(serverErrors.value)) {
    const changed = key === 'phone' ? next.phone !== before.phone : key === 'amount' ? next.amount !== before.amount : next.values[key] !== before.values[key]
    if (changed) serverErrors.value = Object.fromEntries(Object.entries(serverErrors.value).filter(([item]) => item !== key))
  }
})

// Cancel and copy (D36): the cancelled order's template (at its latest version) and the values that still fit.
const copyId = typeof route.query.copy === 'string' ? route.query.copy : undefined
const copySource = copyId ? useApiQuery(`orders:copy:${copyId}`, () => apiFetch<OrderDetail>(`/shop/orders/${copyId}`)) : undefined
const copiedFrom = ref<number>()
watch([() => templates.data.value, () => copySource?.data.value], async ([list, source]) => {
  if (!list || !source || copiedFrom.value !== undefined) return
  selectedId.value = startingTemplate(list, source.templateId)?.templateId
  await nextTick()
  const design = template.value?.design
  if (!design) return
  fill.value = carryFill({ values: source.values, phone: source.phone ? formatPhone(source.phone) : '', amount: source.amount, paid: source.paid }, design)
  if (source.customerId && source.customerName) customer.value = { id: source.customerId, name: source.customerName, phone: source.phone }
  copiedFrom.value = source.number
}, { immediate: true })

const shop = computed<SlipShop | undefined>(() => {
  const value = settings.data.value
  return value && { name: value.name, phone: value.phone, address: value.address, logoImageId: null, currency: value.currency }
})
const draft = computed(() => shop.value && fillData(fill.value, { shop: shop.value, date: shopToday() }))
const imageHref = (imageId: string) => `/api/shop/templates/${selectedId.value}/images/${imageId}`

// --- Steps ---

const step = computed(() => (route.query.step === 'preview' && template.value ? 'preview' : 'form'))
onMounted(() => {
  // A reload on the preview starts again at the form: the fill lives in this page only.
  if (route.query.step) router.replace({ query: {} })
})

const form = useTemplateRef('form')
async function preview() {
  showProblems.value = true
  quoteChanged.value = false
  if (Object.keys(problems.value).length || Object.keys(serverErrors.value).length) {
    await nextTick()
    form.value?.focusFirstProblem()
    return
  }
  slipUpdated.value = false
  await router.push({ query: { step: 'preview' } })
  window.scrollTo({ top: 0 })
}

function edit() {
  if (window.history.state?.back) router.back()
  else router.replace({ query: {} })
}

// --- Saving ---

/** One key for this order, kept for every retry (a refused save stores nothing, so it stays usable). */
const submissionKey = crypto.randomUUID()
const saved = ref(false)
const save = useMutation((body: ReturnType<typeof toCreateRequest>) => apiFetch<OrderDetail>('/shop/orders', {
  method: 'POST',
  body,
  headers: { 'Idempotency-Key': submissionKey },
}), { inline: true, invalidate: ['orders'] })

const dirty = computed(() => !saved.value && (Object.keys(fill.value.values).length > 0 || fill.value.phone.trim() !== '' || fill.value.amount !== null || fill.value.paid || customer.value !== null))
useUnsavedChanges(() => dirty.value)

const failure = computed(() => {
  const error = save.error.value
  if (!error || error.code === 'TEMPLATE_CHANGED' || error.code === 'SLIP_VALUES_INVALID' || error.code === 'QUOTE_CHANGED') return undefined
  return errorText(error, t, te)
})

async function submit(print: boolean) {
  const current = template.value
  if (!current || save.pending.value) return
  const result = await save.execute(toCreateRequest(fill.value, current, { customerId: customer.value?.id ?? null, dueDate: dueDate.value || null }))
  if (result.ok) {
    saved.value = true
    await router.replace({ path: `/orders/${result.data.id}`, query: print ? { saved: '1', print: '1' } : { saved: '1' } })
    return
  }
  if (result.error.code === 'TEMPLATE_CHANGED') {
    // Reload the slip; the watch above keeps what still fits. Back to the form to check it.
    await templates.refresh()
    slipUpdated.value = true
    edit()
  }
  else if (result.error.code === 'QUOTE_CHANGED') {
    await priceList.refresh()
    quoteChanged.value = true
    edit()
  }
  else if (result.error.code === 'SLIP_VALUES_INVALID') {
    serverErrors.value = serverProblems(result.error.fieldErrors)
    showProblems.value = true
    edit()
  }
}

const ready = computed(() => templates.data.value && settings.data.value && slipText.text.value)
const loadError = computed(() => templates.error.value ?? settings.error.value)
function retryLoad() {
  if (templates.error.value) templates.refresh()
  if (settings.error.value) settings.refresh()
  if (slipText.failed.value) slipText.reload()
}
</script>

<template>
  <UDashboardPanel id="new-order">
    <template #header>
      <UDashboardNavbar :title="step === 'preview' ? t('orders.preview.title') : t('orders.new.title')">
        <template #leading>
          <UButton
            v-if="step === 'preview'"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            :aria-label="t('orders.preview.edit')"
            @click="edit"
          />
          <UButton
            v-else
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            to="/"
            :aria-label="t('common.actions.back')"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-page space-y-4">
        <PageLoadError
          v-if="loadError || slipText.failed.value"
          :error="loadError ?? new Error('fonts')"
          @retry="retryLoad"
        />
        <div
          v-else-if="!ready"
          class="space-y-3"
        >
          <USkeleton class="h-12 w-full" />
          <USkeleton
            v-for="n in 4"
            :key="n"
            class="h-16 w-full"
          />
        </div>

        <!-- No paper slip attached: nothing to fill (implementation guide → sheet 11). -->
        <UEmpty
          v-else-if="!templates.data.value?.length"
          icon="i-lucide-file-x"
          :title="t('orders.new.noSlipTitle')"
          :description="t('orders.new.noSlipDescription')"
          :actions="supportUrl ? [{ label: t('more.contactSupport'), icon: 'i-lucide-message-circle', to: supportUrl, target: '_blank', external: true }] : []"
          data-testid="no-slip"
        />

        <template v-else>
          <!-- Kept mounted (hidden) during the preview, so Edit brings back every field exactly as typed. -->
          <div
            v-show="step === 'form'"
            class="space-y-4"
          >
            <UFormField
              v-if="templateItems.length > 1"
              :label="t('orders.new.slip')"
              :help="template ? undefined : t('orders.new.chooseSlip')"
              :ui="{ label: 'text-base' }"
            >
              <USelect
                :model-value="selectedId"
                :items="templateItems"
                :placeholder="t('orders.new.chooseSlip')"
                size="xl"
                class="w-full"
                data-testid="slip-select"
                @update:model-value="chooseTemplate(String($event))"
              />
            </UFormField>

            <UAlert
              v-if="copiedFrom !== undefined"
              color="info"
              variant="subtle"
              icon="i-lucide-copy"
              :title="t('orders.new.copiedFrom', { number: copiedFrom })"
              data-testid="copied-from"
            />
            <UAlert
              v-if="quoteChanged"
              color="warning"
              variant="subtle"
              icon="i-lucide-refresh-cw"
              :title="t('orders.new.quoteChanged')"
              role="alert"
              data-testid="quote-changed"
            />
            <UAlert
              v-if="slipUpdated"
              color="warning"
              variant="subtle"
              icon="i-lucide-refresh-cw"
              :title="t('orders.new.slipUpdated')"
              role="alert"
            />

            <UFormField
              v-if="can('customer:read')"
              :label="t('customers.pick.label')"
              :ui="{ label: 'text-base' }"
            >
              <CustomerPicker v-model="customer" />
            </UFormField>

            <OrderForm
              v-if="template && shop"
              ref="form"
              v-model="fill"
              :design="template.design"
              :currency="shop.currency"
              :problems="problems"
              :server-errors="serverErrors"
              :prices="itemized ? prices : undefined"
              :total="itemized && hasAmountField ? (quote?.total ?? 0) : undefined"
            />

            <UFormField
              :label="t('orders.new.dueDate')"
              :hint="t('common.optional')"
              :ui="{ label: 'text-base' }"
            >
              <UInput
                v-model="dueDate"
                type="date"
                :min="today"
                size="xl"
                class="w-full"
                data-testid="due-date"
              />
            </UFormField>
          </div>

          <template v-if="step === 'preview' && template && draft && slipText.text.value">
            <p class="text-sm text-muted">
              {{ t('orders.preview.hint') }}
            </p>
            <UAlert
              v-if="failure"
              color="error"
              variant="subtle"
              icon="i-lucide-circle-alert"
              :title="failure"
              :description="save.error.value?.retryable ? t('orders.preview.retryHint') : undefined"
              role="alert"
              data-testid="save-error"
            />
            <SlipView
              :design="template.design"
              :data="draft"
              :text="slipText.text.value"
              :image-href="imageHref"
            />
          </template>
        </template>

        <BottomBarSpacer />
        <BottomBar v-if="ready && template">
          <template v-if="step === 'form'">
            <UButton
              :label="t('orders.new.preview')"
              icon="i-lucide-eye"
              size="xl"
              block
              class="sm:w-auto"
              data-testid="preview"
              @click="preview"
            />
          </template>
          <template v-else>
            <div class="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
              <UButton
                :label="t('orders.preview.edit')"
                icon="i-lucide-pencil"
                color="neutral"
                variant="outline"
                size="xl"
                block
                :disabled="save.pending.value"
                data-testid="edit"
                @click="edit"
              />
              <UButton
                :label="t('orders.preview.savePrint')"
                icon="i-lucide-printer"
                size="xl"
                block
                :loading="save.pending.value"
                data-testid="save-print"
                @click="submit(true)"
              />
              <UButton
                :label="t('orders.preview.saveOnly')"
                icon="i-lucide-save"
                color="neutral"
                variant="outline"
                size="xl"
                block
                class="col-span-2"
                :disabled="save.pending.value"
                data-testid="save-only"
                @click="submit(false)"
              />
            </div>
          </template>
        </BottomBar>
      </div>
    </template>
  </UDashboardPanel>
</template>
