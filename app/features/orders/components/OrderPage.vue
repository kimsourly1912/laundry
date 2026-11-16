<script setup lang="ts">
/**
 * An order (spec §4 → detail / editor): customer, lines, total, payment, history, and the actions
 * its status allows (spec §7), in thumb reach. Each action sends the version read; a conflict
 * offers to reload. Payment sends an `Idempotency-Key` per confirmation. Telegram status joins with M4.
 */
import type { Order, OrderAction } from '#shared/contracts/orders'
import { canRecordPayment, canTransition, isEditable } from '#shared/contracts/orders'
import { formatPhone } from '#shared/contracts/phone'
import { formatQuantity } from '../schemas/order-lines'
import { customerLabel } from '../schemas/slip-form'
import OrderBadges from './OrderBadges.vue'

const props = defineProps<{ id: string }>()
const { t, te, locale } = useI18n()
const { can } = useSession()
const order = useApiQuery(() => `orders:order:${props.id}`, () => apiFetch<Order>(`/shop/orders/${props.id}`))
const record = computed(() => order.data.value ?? undefined)
const missing = computed(() => order.error.value?.kind === 'not_found')

const act = useMutation((input: { action: OrderAction, body?: Record<string, unknown> }) =>
  apiFetch<Order>(`/shop/orders/${props.id}/${input.action}`, { method: 'POST', body: { version: record.value!.version, ...input.body } }), {
  inline: true,
  invalidate: ['orders'],
  success: order => t(`orders.done.${order.status}`, { number: order.number }),
})
let paymentKey = ''
const pay = useMutation(() => apiFetch<Order>(`/shop/orders/${props.id}/payment`, {
  method: 'POST',
  headers: { 'Idempotency-Key': paymentKey },
  body: { version: record.value!.version },
}), { inline: true, invalidate: ['orders'], success: () => t('orders.paymentRecorded') })
const failure = computed(() => {
  const error = act.error.value ?? pay.error.value
  return error ? errorText(error, t, te) : undefined
})
const conflict = computed(() => (act.error.value ?? pay.error.value)?.code === 'VERSION_CONFLICT')

/** Which confirmation is open: payment, collect while unpaid, cancel. */
const confirming = ref<'payment' | 'collectUnpaid' | 'cancel'>()
const busy = computed(() => act.pending.value || pay.pending.value)

function confirmPayment() {
  paymentKey = crypto.randomUUID()
  confirming.value = 'payment'
}

async function run(action: OrderAction, body?: Record<string, unknown>) {
  pay.reset()
  await act.execute({ action, body })
  confirming.value = undefined
}

function collect() {
  if (record.value?.paymentStatus === 'paid') void run('collect')
  else confirming.value = 'collectUnpaid'
}

async function onPay() {
  act.reset()
  await pay.execute(undefined)
  confirming.value = undefined
}

function reload() {
  act.reset()
  pay.reset()
  void order.refresh()
}

const may = (action: OrderAction) => Boolean(record.value) && canTransition(record.value!.status, action) && can(action === 'cancel' ? 'order:cancel' : 'order:transition')
const mayPay = computed(() => Boolean(record.value) && canRecordPayment(record.value!.status, record.value!.paymentStatus) && can('payment:record'))
const mayEdit = computed(() => Boolean(record.value) && isEditable(record.value!.status) && can('order:update'))
// No Start button (D27): an order goes from received straight to ready; "in progress" stays for older orders.
const hasActions = computed(() => mayPay.value || (['ready', 'rework', 'collect'] as const).some(may))
const lineName = (names: { nameEn: string, nameKm: string | null }) => localName(names, locale.value)
const money = (minor: number) => formatMoney(minor, record.value!.currency, locale.value)
</script>

<template>
  <UDashboardPanel id="order">
    <template #header>
      <UDashboardNavbar :title="record ? t('orders.title', { number: record.number }) : t('orders.titleLoading')">
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            :aria-label="t('orders.back')"
            to="/orders"
          />
        </template>
        <template #right>
          <UButton
            v-if="mayEdit"
            :label="t('orders.edit')"
            icon="i-lucide-pencil"
            color="neutral"
            variant="outline"
            :to="`/orders/${id}/edit`"
          />
          <UDropdownMenu
            v-if="may('cancel')"
            :items="[{ label: t('orders.action.cancel'), icon: 'i-lucide-x', color: 'error', onSelect: () => { confirming = 'cancel' } }]"
          >
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              :aria-label="t('orders.more')"
              :disabled="busy"
            />
          </UDropdownMenu>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-page space-y-6">
        <UEmpty
          v-if="missing"
          icon="i-lucide-file-x"
          :title="t('orders.notFound')"
          :actions="[{ label: t('orders.back'), color: 'neutral', variant: 'outline', to: '/orders' }]"
        />
        <PageLoadError
          v-else-if="order.error.value && !record"
          :error="order.error.value"
          @retry="order.refresh()"
        />
        <USkeleton
          v-else-if="!record"
          class="h-64 w-full"
        />
        <template v-else>
          <UAlert
            v-if="failure"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="failure"
            role="alert"
            :actions="conflict ? [{ label: t('common.actions.reload'), color: 'neutral', variant: 'outline', onClick: reload }] : []"
          />

          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <NuxtLink
                v-if="!record.customer.anonymized && (record.customer.name || record.customer.phone)"
                :to="`/customers/${record.customer.id}`"
                class="font-medium break-words underline-offset-2 hover:underline"
              >
                {{ customerLabel(record.customer, t) }}
              </NuxtLink>
              <p
                v-else
                class="font-medium"
              >
                {{ customerLabel(record.customer, t) }}
              </p>
              <p class="text-sm text-muted tabular-nums">
                {{ record.customer.phone ? formatPhone(record.customer.phone) : t('customers.noPhone') }}
              </p>
            </div>
            <OrderBadges
              :order="record"
              class="shrink-0"
            />
          </div>

          <ul class="divide-y divide-default rounded-md border border-default text-sm">
            <li
              v-for="line in record.lines"
              :key="line.id"
              class="flex items-start justify-between gap-3 px-4 py-2"
            >
              <span class="min-w-0 break-words">
                {{ lineName({ nameEn: line.serviceNameEn, nameKm: line.serviceNameKm }) }} · {{ lineName({ nameEn: line.itemNameEn, nameKm: line.itemNameKm }) }}
                <span class="block text-muted tabular-nums">{{ formatQuantity(line.unit, line.quantity) }} {{ t(`orders.unit.${line.unit}`) }} × {{ money(line.unitPrice) }}</span>
              </span>
              <span class="shrink-0 tabular-nums">{{ money(line.lineTotal) }}</span>
            </li>
            <li class="flex justify-between gap-3 px-4 py-2 font-semibold">
              <span>{{ t('orders.total') }}</span>
              <span class="tabular-nums">{{ money(record.total) }}</span>
            </li>
          </ul>

          <p
            v-if="record.note"
            class="text-sm break-words whitespace-pre-line"
          >
            <span class="text-muted">{{ t('orders.note') }}:</span> {{ record.note }}
          </p>

          <section class="space-y-2">
            <h2 class="text-sm font-semibold">
              {{ t('orders.history') }}
            </h2>
            <ol class="space-y-1 text-sm">
              <li
                v-for="event in record.events"
                :key="event.id"
                class="flex flex-wrap justify-between gap-x-3"
              >
                <span>{{ t(`orders.event.${event.type}`) }}<span
                  v-if="event.actorName"
                  class="text-muted"
                > · {{ event.actorName }}</span></span>
                <span class="text-muted tabular-nums">{{ formatDateTime(event.createdAt, locale) }}</span>
              </li>
            </ol>
          </section>

          <BottomBar v-if="hasActions">
            <UButton
              v-if="may('rework')"
              :label="t('orders.action.rework')"
              color="neutral"
              variant="outline"
              :loading="act.pending.value"
              :disabled="busy"
              @click="run('rework')"
            />
            <UButton
              v-if="mayPay"
              :label="t('orders.action.payment')"
              icon="i-lucide-banknote"
              :color="may('collect') ? 'neutral' : 'primary'"
              :variant="may('collect') ? 'outline' : 'solid'"
              :disabled="busy"
              @click="confirmPayment"
            />
            <UButton
              v-if="may('ready')"
              :label="t('orders.action.ready')"
              :disabled="busy"
              @click="run('ready')"
            />
            <UButton
              v-if="may('collect')"
              :label="t('orders.action.collect')"
              :disabled="busy"
              @click="collect"
            />
          </BottomBar>
          <BottomBarSpacer v-if="hasActions" />
        </template>
      </div>

      <UModal
        :open="confirming !== undefined"
        :title="confirming === 'payment' ? t('orders.confirm.paymentTitle', { total: record ? money(record.total) : '' })
          : confirming === 'cancel' ? t('orders.confirm.cancelTitle', { number: record?.number })
            : t('orders.confirm.collectUnpaidTitle')"
        :description="confirming === 'payment' ? t('orders.confirm.paymentDescription')
          : confirming === 'cancel' ? (record?.paymentStatus === 'paid' ? t('orders.confirm.cancelPaidDescription') : t('orders.confirm.cancelDescription'))
            : t('orders.confirm.collectUnpaidDescription', { total: record ? money(record.total) : '' })"
        :dismissible="!busy"
        @update:open="open => { if (!open) confirming = undefined }"
      >
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton
              :label="t('common.actions.cancel')"
              color="neutral"
              variant="ghost"
              :disabled="busy"
              @click="confirming = undefined"
            />
            <UButton
              v-if="confirming === 'payment'"
              :label="t('orders.action.payment')"
              :loading="pay.pending.value"
              @click="onPay()"
            />
            <UButton
              v-else-if="confirming === 'cancel'"
              :label="t('orders.action.cancel')"
              color="error"
              :loading="act.pending.value"
              @click="run('cancel')"
            />
            <UButton
              v-else
              :label="t('orders.action.collectUnpaid')"
              color="warning"
              :loading="act.pending.value"
              @click="run('collect', { allowUnpaid: true })"
            />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
