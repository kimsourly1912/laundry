<script setup lang="ts">
/**
 * New order (spec §4, §8.1; page-patterns → Task flow): customer → lines → review (note, paid) →
 * done. One `Idempotency-Key` for the whole flow, so a double tap or a retry after a network error
 * makes one order. The total shown is a preview; the server's is the one saved. The slip joins
 * this flow with M3.2.
 */
import type { FormErrorEvent } from '@nuxt/ui'
import type { Customer } from '#shared/contracts/customers'
import type { Order } from '#shared/contracts/orders'
import { ORDER_NOTE_MAX } from '#shared/contracts/orders'
import { CustomerPicker } from '~/features/customers'
import { useShopSettings } from '~/features/shop-settings'
import type { DraftLine } from '../schemas/order-lines'
import { draftTotal, lineErrors, previewTotal, toCreateLines } from '../schemas/order-lines'
import LinesEditor from './LinesEditor.vue'

type Step = 'customer' | 'lines' | 'review' | 'done'
const STEPS: Step[] = ['customer', 'lines', 'review']

const { t, te, locale } = useI18n()
const settings = useShopSettings()
const currency = computed(() => settings.data.value?.currency ?? 'KHR')

const step = ref<Step>('customer')
const customer = ref<Customer>()
const lines = ref<DraftLine[]>([])
const note = ref('')
const paid = ref(false)
let idempotencyKey = crypto.randomUUID()
const created = ref<Order>()

const linesForm = useTemplateRef('linesForm')
useFormErrorRecheck(linesForm)
const linesState = reactive({ lines })
function validateLines() {
  return lineErrors(lines.value, t)
}

const create = useMutation(() => apiFetch<Order>('/shop/orders', {
  method: 'POST',
  headers: { 'Idempotency-Key': idempotencyKey },
  body: { customerId: customer.value!.id, lines: toCreateLines(lines.value), note: note.value, paid: paid.value },
}), { inline: true, invalidate: ['orders'] })

const dirty = computed(() => step.value !== 'done' && Boolean(customer.value || lines.value.length || note.value.trim()))
useUnsavedChanges(() => dirty.value && !create.pending.value)

/** A refusal that belongs to an earlier step goes back to that step with its message (page-patterns). */
const customerProblem = ref<string>()
const failure = computed(() => (create.error.value && !create.error.value.fieldErrors ? errorText(create.error.value, t, te) : undefined))

watch(customer, (value) => {
  if (value) {
    customerProblem.value = undefined
    if (step.value === 'customer') step.value = 'lines'
  }
})

function onLinesError(event: FormErrorEvent) {
  focusFirstError(event)
}

function toReview() {
  step.value = 'review'
}

async function submit() {
  const result = await create.execute(undefined)
  if (result.ok) {
    created.value = result.data
    step.value = 'done'
    return
  }
  const { code, fieldErrors } = result.error
  if (code === 'CUSTOMER_UNAVAILABLE') {
    customer.value = undefined
    customerProblem.value = t('errors.code.CUSTOMER_UNAVAILABLE')
    step.value = 'customer'
  }
  else if (fieldErrors && Object.keys(fieldErrors).some(path => path.startsWith('lines'))) {
    step.value = 'lines'
    await nextTick()
    linesForm.value?.setErrors(formErrors(fieldErrors).map(error => ({ ...error, name: error.name.replace(/\.priceItemId$/, '.quantity'), message: code === 'PRICE_ITEM_UNAVAILABLE' ? t('errors.code.PRICE_ITEM_UNAVAILABLE') : error.message })))
  }
}

function back() {
  const index = STEPS.indexOf(step.value)
  if (index > 0) step.value = STEPS[index - 1]!
}

function startOver() {
  customer.value = undefined
  lines.value = []
  note.value = ''
  paid.value = false
  created.value = undefined
  create.reset()
  idempotencyKey = crypto.randomUUID()
  step.value = 'customer'
}

const stepNumber = computed(() => STEPS.indexOf(step.value) + 1)
const total = computed(() => previewTotal(lines.value))
</script>

<template>
  <UDashboardPanel id="new-order">
    <template #header>
      <UDashboardNavbar :title="t('orders.new')">
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            :aria-label="t('orders.back')"
            to="/orders"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-xl space-y-6">
        <template v-if="step !== 'done'">
          <p class="text-sm text-muted">
            {{ t('orders.flow.step', { step: stepNumber, of: STEPS.length }) }} · {{ t(`orders.flow.${step}`) }}
          </p>

          <!-- Answers so far, each with a way back (page-patterns → Task flow). -->
          <div
            v-if="customer && step !== 'customer'"
            class="flex items-center justify-between gap-3 text-sm"
          >
            <span class="min-w-0 break-words"><span class="text-muted">{{ t('orders.customer') }}:</span> {{ customer.name }}</span>
            <UButton
              :label="t('common.actions.change')"
              color="neutral"
              variant="link"
              size="sm"
              @click="step = 'customer'"
            />
          </div>
        </template>

        <section
          v-show="step === 'customer'"
          class="space-y-4"
        >
          <UAlert
            v-if="customerProblem"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="customerProblem"
            role="alert"
          />
          <CustomerPicker v-model="customer" />
        </section>

        <UForm
          v-show="step === 'lines'"
          ref="linesForm"
          :state="linesState"
          :validate="validateLines"
          :validate-on="['input', 'change']"
          class="space-y-4"
          @submit="toReview"
          @error="onLinesError"
        >
          <LinesEditor
            v-model="lines"
            :currency="currency"
          />
          <BottomBar>
            <UButton
              :label="t('common.actions.back')"
              color="neutral"
              variant="ghost"
              @click="back"
            />
            <UButton
              type="submit"
              :label="t('orders.flow.next')"
            />
          </BottomBar>
        </UForm>

        <section
          v-if="step === 'review'"
          class="space-y-6"
        >
          <UAlert
            v-if="failure"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="failure"
            role="alert"
          />
          <ul class="divide-y divide-default rounded-md border border-default text-sm">
            <li
              v-for="line in lines"
              :key="line.key"
              class="flex justify-between gap-3 px-4 py-2"
            >
              <span class="min-w-0 break-words">{{ localName({ nameEn: line.itemNameEn, nameKm: line.itemNameKm }, locale) }} × {{ line.quantity }} {{ t(`orders.unit.${line.unit}`) }}</span>
              <span class="shrink-0 tabular-nums">{{ formatMoney(draftTotal(line) ?? 0, currency, locale) }}</span>
            </li>
            <li class="flex justify-between gap-3 px-4 py-2 font-semibold">
              <span>{{ t('orders.total') }}</span>
              <span class="tabular-nums">{{ formatMoney(total, currency, locale) }}</span>
            </li>
          </ul>
          <UFormField
            :label="t('orders.note')"
            name="note"
          >
            <UTextarea
              v-model="note"
              :rows="2"
              :maxlength="ORDER_NOTE_MAX"
              autoresize
              class="w-full"
            />
          </UFormField>
          <USwitch
            v-model="paid"
            :label="t('orders.paidNow')"
            :description="t('orders.paidNowHelp', { total: formatMoney(total, currency, locale) })"
          />
          <BottomBar>
            <UButton
              :label="t('common.actions.back')"
              color="neutral"
              variant="ghost"
              :disabled="create.pending.value"
              @click="back"
            />
            <UButton
              :label="t('orders.create')"
              :loading="create.pending.value"
              @click="submit"
            />
          </BottomBar>
        </section>

        <section
          v-if="step === 'done' && created"
          class="space-y-6"
        >
          <UAlert
            color="success"
            variant="subtle"
            icon="i-lucide-circle-check"
            :title="t('orders.created', { number: created.number })"
            :description="t('orders.createdDescription', { name: created.customer.name, total: formatMoney(created.total, created.currency, locale) })"
          />
          <div class="flex flex-wrap justify-end gap-2">
            <UButton
              :label="t('orders.new')"
              icon="i-lucide-plus"
              color="neutral"
              variant="outline"
              @click="startOver"
            />
            <UButton
              :label="t('orders.view')"
              :to="`/orders/${created.id}`"
            />
          </div>
        </section>
        <BottomBarSpacer v-if="step === 'lines' || step === 'review'" />
      </div>
    </template>
  </UDashboardPanel>
</template>
