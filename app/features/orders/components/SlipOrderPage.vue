<script setup lang="ts">
/**
 * New order, shaped like the shop's paper slip (D27): the phone and name (both optional; a known
 * phone shows its customer), a tab per service with a box per item, a note, paid or not, then one
 * Save. One `Idempotency-Key` per slip, so a double tap or a retry makes one order. The total shown
 * is a preview; the server's is the one saved.
 */
import type { FormErrorEvent } from '@nuxt/ui'
import type { Page } from '#shared/contracts/common'
import type { Customer } from '#shared/contracts/customers'
import type { Order } from '#shared/contracts/orders'
import { ORDER_CUSTOMER_NAME_MAX, ORDER_NOTE_MAX } from '#shared/contracts/orders'
import { formatPhone, toE164 } from '#shared/contracts/phone'
import { usePriceItems, useServiceTypes } from '~/features/pricing'
import { useShopSettings } from '~/features/shop-settings'
import type { SlipForm } from '../schemas/slip-form'
import { customerLabel, emptySlip, filledCount, slipErrors, slipTotal, stepPieces, toSlipRequest } from '../schemas/slip-form'
import { parseQuantity } from '../schemas/order-lines'

const { t, te, locale } = useI18n()
const settings = useShopSettings()
const types = useServiceTypes('active')
const items = usePriceItems('active')
const currency = computed(() => settings.data.value?.currency ?? 'KHR')
const money = (minor: number) => formatMoney(minor, currency.value, locale.value)

const state = reactive<SlipForm>(emptySlip())
let idempotencyKey = crypto.randomUUID()
const created = ref<Order>()

// The slip's tabs: each active service with its active items, in price list order.
const tabs = computed(() => (types.data.value?.items ?? [])
  .map(type => ({ type, items: (items.data.value?.items ?? []).filter(item => item.serviceTypeId === type.id) }))
  .filter(tab => tab.items.length))
const allItems = computed(() => tabs.value.flatMap(tab => tab.items))
const activeTab = ref<string>()
watch(tabs, (list) => {
  if (!list.some(tab => tab.type.id === activeTab.value)) activeTab.value = list[0]?.type.id
}, { immediate: true })
const tabItems = computed(() => [...tabs.value.map((tab) => {
  const count = filledCount(state, tab.items.map(item => item.id))
  return { label: localName(tab.type, locale.value), value: tab.type.id, badge: count ? String(count) : undefined }
})])
const shown = computed(() => tabs.value.find(tab => tab.type.id === activeTab.value)?.items ?? [])

// A phone already the shop's customer's shows who it is; the name box is then not needed.
const known = ref<Customer>()
let lookingUp: ReturnType<typeof setTimeout> | undefined
watch(() => state.phone, (phone) => {
  clearTimeout(lookingUp)
  known.value = undefined
  const e164 = toE164(phone)
  if (!e164) return
  lookingUp = setTimeout(async () => {
    try {
      const page = await apiFetch<Page<Customer>>('/shop/customers', { query: { search: phone, pageSize: 5 } })
      if (toE164(state.phone) === e164) known.value = page.items.find(customer => customer.phone === e164)
    }
    catch {
      // Only a hint: the server finds the customer by phone anyway.
    }
  }, 300)
})
onBeforeUnmount(() => clearTimeout(lookingUp))

const form = useTemplateRef('form')
useFormErrorRecheck(form)
function validate() {
  return slipErrors(state, allItems.value, t)
}

const save = useMutation(() => apiFetch<Order>('/shop/orders', {
  method: 'POST',
  headers: { 'Idempotency-Key': idempotencyKey },
  body: toSlipRequest(state, allItems.value),
}), { inline: true, invalidate: ['orders'] })
const failure = computed(() => (save.error.value ? errorText(save.error.value, t, te) : undefined))

const dirty = computed(() => !created.value && JSON.stringify(state) !== JSON.stringify(emptySlip()))
useUnsavedChanges(() => dirty.value && !save.pending.value)

async function onSubmit() {
  const result = await save.execute(undefined)
  if (result.ok) {
    created.value = result.data
    window.scrollTo({ top: 0 })
  }
  // A price archived meanwhile: the list reloads, so the box shows what's offered now.
  else if (result.error.code === 'PRICE_ITEM_UNAVAILABLE') {
    void items.refresh()
  }
}

/** An item's box with an error may be on another tab: show that tab, then go to the box. */
async function onError(event: FormErrorEvent) {
  const first = event.errors[0]?.name ?? ''
  const id = first.startsWith('quantities.') ? first.slice('quantities.'.length) : undefined
  const owner = id ? tabs.value.find(tab => tab.items.some(item => item.id === id)) : undefined
  if (owner) activeTab.value = owner.type.id
  await nextTick()
  focusFirstError(event)
}

function step(id: string, by: 1 | -1) {
  state.quantities[id] = stepPieces(state.quantities[id], by)
}

function lineTotalText(item: { id: string, unit: 'piece' | 'kg', price: number }) {
  const quantity = parseQuantity(item.unit, state.quantities[item.id] ?? '')
  return quantity === null ? '' : money(slipTotal({ ...emptySlip(), quantities: { [item.id]: state.quantities[item.id]! } }, [item]))
}

function startOver() {
  Object.assign(state, emptySlip())
  known.value = undefined
  created.value = undefined
  save.reset()
  idempotencyKey = crypto.randomUUID()
  activeTab.value = tabs.value[0]?.type.id
  window.scrollTo({ top: 0 })
}

const total = computed(() => slipTotal(state, allItems.value))
const loading = computed(() => types.loading.value || items.loading.value || settings.loading.value)
const loadError = computed(() => types.error.value ?? items.error.value ?? settings.error.value)
function retry() {
  void types.refresh()
  void items.refresh()
  void settings.refresh()
}
</script>

<template>
  <UDashboardPanel id="new-order">
    <template #header>
      <UDashboardNavbar :title="t('orders.new')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-page space-y-6">
        <!-- Saved: the number to write on the bag, then the next customer. -->
        <section
          v-if="created"
          class="space-y-6"
        >
          <div
            class="rounded-lg border border-default p-6 text-center"
            role="status"
          >
            <p class="text-sm text-muted">
              {{ t('orders.slip.saved') }}
            </p>
            <p class="text-5xl font-bold tabular-nums">
              #{{ created.number }}
            </p>
            <p class="mt-2 break-words">
              {{ customerLabel(created.customer, t) }} · {{ formatMoney(created.total, created.currency, locale) }}
            </p>
            <UBadge
              :label="t(`orders.payment.${created.paymentStatus}`)"
              :color="created.paymentStatus === 'paid' ? 'success' : 'warning'"
              variant="subtle"
              class="mt-2"
            />
          </div>
          <div class="flex flex-col gap-2 sm:flex-row-reverse">
            <UButton
              :label="t('orders.slip.next')"
              icon="i-lucide-plus"
              size="xl"
              block
              @click="startOver"
            />
            <UButton
              :label="t('orders.view')"
              color="neutral"
              variant="outline"
              size="xl"
              block
              :to="`/orders/${created.id}`"
            />
          </div>
        </section>

        <PageLoadError
          v-else-if="loadError && !items.data.value"
          :error="loadError"
          @retry="retry"
        />
        <div
          v-else-if="loading"
          class="space-y-2"
        >
          <USkeleton
            v-for="n in 5"
            :key="n"
            class="h-14 w-full"
          />
        </div>
        <UEmpty
          v-else-if="!tabs.length"
          icon="i-lucide-tags"
          :title="t('orders.slip.noPrices')"
          :description="t('orders.slip.noPricesDescription')"
        />

        <UForm
          v-else
          ref="form"
          :state="state"
          :validate="validate"
          :validate-on="['input', 'change']"
          :disabled="save.pending.value"
          class="space-y-6"
          @submit="onSubmit"
          @error="onError"
        >
          <UAlert
            v-if="failure"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="failure"
            role="alert"
          />

          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField
              :label="t('orders.slip.phone')"
              :hint="t('common.optional')"
              name="phone"
            >
              <UInput
                v-model="state.phone"
                type="tel"
                inputmode="tel"
                autocomplete="off"
                icon="i-lucide-phone"
                size="xl"
                class="w-full"
              />
            </UFormField>
            <div
              v-if="known"
              class="flex items-end pb-2 text-sm"
              role="status"
            >
              <span class="flex items-center gap-1.5 break-words">
                <UIcon
                  name="i-lucide-user-check"
                  class="size-5 shrink-0 text-success"
                />
                {{ known.name || formatPhone(known.phone!) }}
              </span>
            </div>
            <UFormField
              v-else
              :label="t('orders.slip.name')"
              :hint="t('common.optional')"
              name="name"
            >
              <UInput
                v-model="state.name"
                autocomplete="off"
                size="xl"
                :maxlength="ORDER_CUSTOMER_NAME_MAX"
                class="w-full"
              />
            </UFormField>
          </div>

          <UFormField name="quantities">
            <UTabs
              v-model="activeTab"
              :items="tabItems"
              :content="false"
              class="w-full"
            />
            <ul class="mt-3 divide-y divide-default rounded-md border border-default">
              <li
                v-for="item in shown"
                :key="item.id"
                class="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div class="min-w-0">
                  <p class="font-medium break-words">
                    {{ localName(item, locale) }}
                  </p>
                  <p class="text-sm text-muted tabular-nums">
                    {{ money(item.price) }} / {{ t(`orders.unit.${item.unit}`) }}
                    <span
                      v-if="lineTotalText(item)"
                      class="font-medium text-default"
                    > · {{ lineTotalText(item) }}</span>
                  </p>
                </div>
                <UFormField
                  :name="`quantities.${item.id}`"
                  class="shrink-0"
                >
                  <div
                    v-if="item.unit === 'piece'"
                    class="flex items-center gap-1"
                  >
                    <UButton
                      icon="i-lucide-minus"
                      color="neutral"
                      variant="outline"
                      size="lg"
                      :aria-label="t('orders.slip.less', { name: localName(item, locale) })"
                      :disabled="!state.quantities[item.id]"
                      @click="step(item.id, -1)"
                    />
                    <UInput
                      v-model="state.quantities[item.id]"
                      inputmode="numeric"
                      autocomplete="off"
                      placeholder="0"
                      size="lg"
                      :aria-label="t('orders.slip.pieces', { name: localName(item, locale) })"
                      class="w-14"
                      :ui="{ base: 'text-center tabular-nums' }"
                    />
                    <UButton
                      icon="i-lucide-plus"
                      color="neutral"
                      variant="outline"
                      size="lg"
                      :aria-label="t('orders.slip.more', { name: localName(item, locale) })"
                      @click="step(item.id, 1)"
                    />
                  </div>
                  <UInput
                    v-else
                    v-model="state.quantities[item.id]"
                    inputmode="decimal"
                    autocomplete="off"
                    placeholder="0"
                    size="lg"
                    :aria-label="t('orders.slip.kg', { name: localName(item, locale) })"
                    class="w-28"
                    :ui="{ base: 'text-end tabular-nums', trailing: 'pe-3' }"
                  >
                    <template #trailing>
                      <span class="text-sm text-muted">{{ t('orders.unit.kg') }}</span>
                    </template>
                  </UInput>
                </UFormField>
              </li>
            </ul>
          </UFormField>

          <UFormField
            :label="t('orders.note')"
            :hint="t('common.optional')"
            name="note"
          >
            <UTextarea
              v-model="state.note"
              :rows="1"
              :maxlength="ORDER_NOTE_MAX"
              autoresize
              class="w-full"
            />
          </UFormField>

          <BottomBar>
            <div class="me-auto">
              <p class="text-xs text-muted">
                {{ t('orders.total') }}
              </p>
              <p class="text-xl font-semibold tabular-nums">
                {{ money(total) }}
              </p>
            </div>
            <USwitch
              v-model="state.paid"
              :label="t('orders.payment.paid')"
              size="lg"
            />
            <UButton
              type="submit"
              :label="t('orders.slip.save')"
              size="xl"
              :loading="save.pending.value"
            />
          </BottomBar>
          <BottomBarSpacer />
        </UForm>
      </div>
    </template>
  </UDashboardPanel>
</template>
