<script setup lang="ts">
import type { Page } from '#shared/contracts/common'
import type { OrderListItem } from '#shared/contracts/orders'
import OrderRows from './OrderRows.vue'

const { t } = useI18n()
const { can } = useSession()
const { filters, page, pageSize, query } = usePaginatedQuery({ search: '' })
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
</script>

<template>
  <UDashboardPanel id="orders">
    <template #header>
      <UDashboardNavbar
        :toggle="false"
        :title="t('orders.list.title')"
        icon="i-lucide-receipt-text"
      >
        <template #right>
          <UColorModeButton />
          <UButton
            v-if="can('order:create')"
            icon="i-lucide-plus"
            color="neutral"
            variant="outline"
            :aria-label="t('orders.new.title')"
            to="/"
            data-testid="new-slip"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-page space-y-4">
        <div class="flex gap-2">
          <UInput
            v-model="search"
            :placeholder="t('orders.list.search')"
            :aria-label="t('orders.list.search')"
            icon="i-lucide-search"
            type="search"
            inputmode="tel"
            class="min-w-0 flex-1"
            data-testid="orders-search"
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
          v-else-if="!orders.data.value?.items.length && search"
          icon="i-lucide-search-x"
          :title="t('orders.list.noMatch')"
          :actions="[{ label: t('common.actions.clearFilters'), color: 'neutral', variant: 'outline', onClick: () => { search = '' } }]"
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
