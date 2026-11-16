<script setup lang="ts">
/** Orders (spec §4 → resource index): status tabs, paid filter, search by number, phone or name; in the URL. */
import type { Page } from '#shared/contracts/common'
import type { OrderSummary } from '#shared/contracts/orders'
import { ORDER_STATUSES } from '#shared/contracts/orders'
import OrderRows from './OrderRows.vue'

const { t } = useI18n()
const { can } = useSession()
const { filters, page, pageSize, query } = usePaginatedQuery({ status: '', payment: '', search: '' })
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

const orders = useApiQuery('orders:list', () => apiFetch<Page<OrderSummary>>('/shop/orders', { query: query.value }), { watch: [query] })

const tabs = computed(() => [
  { label: t('orders.tabs.all'), value: '' },
  ...ORDER_STATUSES.map(status => ({ label: t(`orders.status.${status}`), value: status })),
])
const paymentOptions = computed(() => [
  { label: t('orders.payment.any'), value: 'any' },
  { label: t('orders.payment.unpaid'), value: 'unpaid' },
  { label: t('orders.payment.paid'), value: 'paid' },
])
// USelect can't hold '' as a value: 'any' stands for no filter.
const payment = computed({
  get: () => filters.payment || 'any',
  set: (value: string) => {
    filters.payment = value === 'any' ? '' : value
  },
})
const filtered = computed(() => Boolean(filters.search || filters.status || filters.payment))
function clearFilters() {
  search.value = ''
  Object.assign(filters, { search: '', status: '', payment: '' })
}
</script>

<template>
  <UDashboardPanel id="orders">
    <template #header>
      <UDashboardNavbar :title="t('orders.listTitle')">
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
      <UDashboardToolbar>
        <div class="flex w-full flex-wrap gap-2">
          <UInput
            v-model="search"
            :placeholder="t('orders.search')"
            :aria-label="t('orders.search')"
            icon="i-lucide-search"
            type="search"
            class="w-full sm:max-w-xs"
          />
          <USelect
            v-model="payment"
            :items="paymentOptions"
            :aria-label="t('orders.payment.filter')"
            class="w-40"
          />
        </div>
      </UDashboardToolbar>
    </template>

    <template #body>
      <UTabs
        v-model="filters.status"
        :items="tabs"
        :content="false"
        variant="link"
        class="w-full overflow-x-auto"
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
          v-for="n in 5"
          :key="n"
          class="h-16 w-full"
        />
      </div>
      <UEmpty
        v-else-if="!orders.data.value?.items.length"
        icon="i-lucide-shirt"
        :title="filtered ? t('orders.noMatch') : t('orders.empty')"
        :description="filtered ? undefined : t('orders.emptyDescription')"
        :actions="filtered
          ? [{ label: t('common.actions.clearFilters'), color: 'neutral', variant: 'outline', onClick: clearFilters }]
          : can('order:create') ? [{ label: t('orders.new'), icon: 'i-lucide-plus', to: '/orders/new' }] : []"
      />
      <template v-else>
        <OrderRows
          :orders="orders.data.value.items"
          :dim="orders.refreshing.value"
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
    </template>
  </UDashboardPanel>
</template>
