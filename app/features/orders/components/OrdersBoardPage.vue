<script setup lang="ts">
/**
 * The orders board (D27), the shop's home: three tabs, Waiting, Ready and Done, with their counts,
 * and on each order the one next step as a big button: Ready, then Collected. Collecting an unpaid
 * order asks first: paid now (the payment, then the pickup) or handed over unpaid. A search looks
 * through every tab (number, phone or name). Tapping an order opens it (edit, cancel, history).
 */
import type { Page } from '#shared/contracts/common'
import type { Order, OrderStage, OrderSummary, TodayOverview } from '#shared/contracts/orders'
import { canTransition } from '#shared/contracts/orders'
import { customerLabel } from '../schemas/slip-form'
import OrderBadges from './OrderBadges.vue'

const { t, te, locale } = useI18n()
const { can, me } = useSession()
const { filters, page, pageSize, query } = usePaginatedQuery({ stage: 'waiting', search: '' })
const search = ref(filters.search)
let typing: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(typing)
  typing = setTimeout(() => {
    filters.search = value.trim()
  }, 300)
})
watch(() => filters.search, (value) => {
  if (value !== search.value.trim()) search.value = value
})
onBeforeUnmount(() => clearTimeout(typing))

// A search looks through every tab; the tab is kept for when the search is cleared.
const listQuery = computed(() => {
  const { stage, ...rest } = query.value
  return filters.search ? rest : { ...rest, stage }
})
const orders = useApiQuery('orders:board', () => apiFetch<Page<OrderSummary>>('/shop/orders', { query: listQuery.value }), { watch: [listQuery] })
const overview = useApiQuery('orders:today', () => apiFetch<TodayOverview>('/shop/today'))

const tabs = computed(() => {
  const counts = overview.data.value?.counts
  const badge = (count: number | undefined) => (count ? String(count) : undefined)
  return [
    { label: t('orders.board.waiting'), value: 'waiting', badge: badge(counts && counts.received + counts.inProgress) },
    { label: t('orders.board.ready'), value: 'ready', badge: badge(counts?.ready) },
    { label: t('orders.board.done'), value: 'done' },
  ] satisfies { label: string, value: OrderStage, badge?: string }[]
})

// --- The next step on a row ---

const working = ref<string>()
const act = useMutation((input: { order: OrderSummary, action: 'ready' | 'collect', body?: Record<string, unknown> }) =>
  apiFetch<Order>(`/shop/orders/${input.order.id}/${input.action}`, { method: 'POST', body: { version: input.order.version, ...input.body } }), {
  invalidate: ['orders'],
  success: order => t(`orders.done.${order.status}`, { number: order.number }),
})
let paymentKey = ''
const pay = useMutation((order: OrderSummary) => apiFetch<Order>(`/shop/orders/${order.id}/payment`, {
  method: 'POST',
  headers: { 'Idempotency-Key': paymentKey },
  body: { version: order.version },
}))

/** The unpaid order being handed over: paid now, or unpaid. */
const handingOver = ref<OrderSummary>()

async function markReady(order: OrderSummary) {
  working.value = order.id
  await act.execute({ order, action: 'ready' })
  working.value = undefined
}

function collect(order: OrderSummary) {
  if (order.paymentStatus === 'paid') {
    void collectNow(order)
    return
  }
  paymentKey = crypto.randomUUID()
  handingOver.value = order
}

async function collectNow(order: OrderSummary, body?: Record<string, unknown>) {
  working.value = order.id
  await act.execute({ order, action: 'collect', body })
  working.value = undefined
  handingOver.value = undefined
}

/** Paid now: the payment (once, by its key), then the pickup at the version the payment left. */
async function paidAndCollected(order: OrderSummary) {
  working.value = order.id
  const paid = await pay.execute(order)
  if (paid.ok) await act.execute({ order: { ...order, version: paid.data.version }, action: 'collect' })
  working.value = undefined
  handingOver.value = undefined
}

const failure = computed(() => {
  const error = act.error.value ?? pay.error.value
  return error ? errorText(error, t, te) : undefined
})
watch(failure, (message) => {
  // A row changed elsewhere: show the board as it is now.
  if (message) void orders.refresh()
})

const mayTransition = computed(() => can('order:transition'))
const mayPay = computed(() => can('payment:record'))
const money = (order: OrderSummary) => formatMoney(order.total, order.currency, locale.value)
function clearSearch() {
  search.value = ''
  filters.search = ''
}
</script>

<template>
  <UDashboardPanel id="orders-board">
    <template #header>
      <!-- The shop's home: its name on top, so the owner sees which shop this is. -->
      <UDashboardNavbar :title="me?.shop?.name ?? t('orders.listTitle')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            v-if="can('order:create')"
            :label="t('orders.new')"
            icon="i-lucide-plus"
            to="/orders/new"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-page space-y-4">
        <UInput
          v-model="search"
          :placeholder="t('orders.search')"
          :aria-label="t('orders.search')"
          icon="i-lucide-search"
          type="search"
          size="lg"
          class="w-full"
        />
        <UTabs
          v-if="!filters.search"
          v-model="filters.stage"
          :items="tabs"
          :content="false"
          class="w-full"
        />

        <UAlert
          v-if="failure"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="failure"
          role="alert"
        />

        <PageLoadError
          v-if="orders.error.value && !orders.data.value"
          :error="orders.error.value"
          @retry="orders.refresh()"
        />
        <div
          v-else-if="orders.loading.value"
          class="space-y-2"
        >
          <USkeleton
            v-for="n in 4"
            :key="n"
            class="h-20 w-full"
          />
        </div>
        <UEmpty
          v-else-if="!orders.data.value?.items.length"
          icon="i-lucide-shirt"
          :title="filters.search ? t('orders.noMatch') : t(`orders.board.empty.${filters.stage}`)"
          :actions="filters.search
            ? [{ label: t('common.actions.clearFilters'), color: 'neutral', variant: 'outline', onClick: clearSearch }]
            : filters.stage === 'waiting' && can('order:create') ? [{ label: t('orders.new'), icon: 'i-lucide-plus', to: '/orders/new' }] : []"
        />
        <template v-else>
          <ul
            class="divide-y divide-default rounded-md border border-default"
            :class="{ 'opacity-60': orders.refreshing.value }"
          >
            <li
              v-for="order in orders.data.value.items"
              :key="order.id"
              class="flex items-center gap-3 px-3 py-3"
            >
              <NuxtLink
                :to="`/orders/${order.id}`"
                class="min-w-0 flex-1 rounded-sm focus-visible:outline-2 focus-visible:outline-primary"
              >
                <p class="font-medium break-words">
                  <span class="text-lg font-semibold tabular-nums">#{{ order.number }}</span>
                  · {{ customerLabel(order.customer, t) }}
                </p>
                <p class="text-sm text-muted tabular-nums">
                  {{ money(order) }} · {{ formatDateTime(order.createdAt, locale) }}
                </p>
                <div class="mt-1 flex">
                  <OrderBadges :order="order" />
                </div>
              </NuxtLink>
              <UButton
                v-if="mayTransition && canTransition(order.status, 'ready')"
                :label="t('orders.action.ready')"
                icon="i-lucide-check"
                size="lg"
                class="shrink-0"
                :loading="working === order.id"
                :disabled="Boolean(working)"
                @click="markReady(order)"
              />
              <UButton
                v-else-if="mayTransition && canTransition(order.status, 'collect')"
                :label="t('orders.action.collect')"
                icon="i-lucide-hand"
                size="lg"
                class="shrink-0"
                :loading="working === order.id"
                :disabled="Boolean(working)"
                @click="collect(order)"
              />
            </li>
          </ul>
          <div
            v-if="orders.data.value.total > pageSize"
            class="flex justify-center"
          >
            <UPagination
              v-model:page="page"
              :total="orders.data.value.total"
              :items-per-page="pageSize"
            />
          </div>
        </template>
      </div>

      <UModal
        :open="Boolean(handingOver)"
        :title="t('orders.confirm.collectUnpaidTitle')"
        :description="handingOver ? t('orders.board.unpaidDescription', { total: money(handingOver) }) : ''"
        :dismissible="!working"
        @update:open="open => { if (!open) handingOver = undefined }"
      >
        <template #footer>
          <div class="flex w-full flex-col gap-2 sm:flex-row-reverse">
            <UButton
              v-if="mayPay"
              :label="t('orders.board.paidAndCollected')"
              size="lg"
              block
              :loading="Boolean(working)"
              @click="paidAndCollected(handingOver!)"
            />
            <UButton
              :label="t('orders.action.collectUnpaid')"
              color="neutral"
              variant="outline"
              size="lg"
              block
              :disabled="Boolean(working)"
              @click="collectNow(handingOver!, { allowUnpaid: true })"
            />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
