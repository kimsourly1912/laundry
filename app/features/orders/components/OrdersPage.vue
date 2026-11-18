<script setup lang="ts">
/**
 * Orders (plan §3, implementation guide → sheet 03): every order of the shop, newest first. Search
 * by order number or phone (exact), filter by state and payment; all in the URL, so a reload or
 * Back keeps the place (page-patterns → Resource index).
 */
import type { Page } from '#shared/contracts/common'
import type { OrderListItem } from '#shared/contracts/orders'
import OrderRows from './OrderRows.vue'

const { t } = useI18n()
const { can } = useSession()
const { filters, page, pageSize, query } = usePaginatedQuery({ search: '', status: '', paid: '' })
const search = ref(filters.search)
// Typing settles before it searches, so each key press isn't a request.
let typing: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(typing)
  typing = setTimeout(() => {
    filters.search = value.trim()
  }, 300)
})
onBeforeUnmount(() => clearTimeout(typing))
watch(() => filters.search, (value) => {
  if (value !== search.value.trim()) search.value = value
})

const orders = useApiQuery('orders:list', () => apiFetch<Page<OrderListItem>>('/shop/orders', { query: query.value }), { watch: [query] })

const tabs = computed(() => [
  { label: t('orders.list.tabs.all'), value: '' },
  ...(['received', 'in_progress', 'ready', 'picked_up', 'cancelled'] as const).map(state => ({ label: t(`orders.state.${state}`), value: state })),
])
const payments = computed(() => [
  { label: t('orders.list.anyPayment'), value: '' },
  { label: t('orders.unpaid'), value: 'false' },
  { label: t('orders.paid'), value: 'true' },
])
// USelect can't hold '' as an item value: map it through a placeholder key.
const ANY = 'any'
const paid = computed({
  get: () => filters.paid || ANY,
  set: (value: string) => {
    filters.paid = value === ANY ? '' : value
  },
})
const filtered = computed(() => Boolean(filters.search || filters.status || filters.paid))
function clearFilters() {
  search.value = ''
  filters.search = ''
  filters.status = ''
  filters.paid = ''
}
</script>

<template>
  <UDashboardPanel id="orders">
    <template #header>
      <UDashboardNavbar :title="t('orders.list.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            v-if="can('order:create')"
            :label="t('orders.new.title')"
            icon="i-lucide-plus"
            to="/orders/new"
          />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <div class="flex w-full flex-wrap gap-2">
          <UInput
            v-model="search"
            :placeholder="t('orders.list.search')"
            :aria-label="t('orders.list.search')"
            icon="i-lucide-search"
            type="search"
            inputmode="tel"
            class="min-w-0 flex-1 sm:max-w-xs"
            data-testid="orders-search"
          />
          <USelect
            v-model="paid"
            :items="payments.map(item => ({ ...item, value: item.value || ANY }))"
            :aria-label="t('orders.list.payment')"
            class="w-32"
            data-testid="orders-paid"
          />
        </div>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-page space-y-4">
        <!-- Six states: the tab row scrolls sideways on a narrow phone instead of squeezing. -->
        <div class="-mx-4 overflow-x-auto px-4">
          <UTabs
            v-model="filters.status"
            :items="tabs"
            :content="false"
            variant="link"
            class="w-max min-w-full"
            data-testid="orders-tabs"
          />
        </div>

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
            class="h-16 w-full"
          />
        </div>
        <UEmpty
          v-else-if="!orders.data.value?.items.length && filtered"
          icon="i-lucide-search-x"
          :title="t('orders.list.noMatch')"
          :actions="[{ label: t('common.actions.clearFilters'), color: 'neutral', variant: 'outline', onClick: clearFilters }]"
          data-testid="orders-no-match"
        />
        <UEmpty
          v-else-if="!orders.data.value?.items.length"
          icon="i-lucide-receipt-text"
          :title="t('orders.latest.emptyTitle')"
          :description="t('orders.latest.emptyDescription')"
        />
        <template v-else-if="orders.data.value">
          <OrderRows
            :orders="orders.data.value.items"
            :class="{ 'opacity-60': orders.refreshing.value }"
            data-testid="orders-list"
          />
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
    </template>
  </UDashboardPanel>
</template>
