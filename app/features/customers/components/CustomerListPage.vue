<script setup lang="ts">
/** Customers (spec §4 → resource index): search by name or phone, pages, in the URL. */
import type { Page } from '#shared/contracts/common'
import type { Customer } from '#shared/contracts/customers'
import { formatPhone } from '#shared/contracts/phone'

const { t } = useI18n()
const { can } = useSession()
const { filters, page, pageSize, query } = usePaginatedQuery({ search: '' })
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

const customers = useApiQuery('customers:list', () => apiFetch<Page<Customer>>('/shop/customers', { query: query.value }), { watch: [query] })
function clearSearch() {
  search.value = ''
  filters.search = ''
}
</script>

<template>
  <UDashboardPanel id="customers">
    <template #header>
      <UDashboardNavbar :title="t('customers.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            v-if="can('customer:write')"
            :label="t('customers.new')"
            icon="i-lucide-user-plus"
            to="/customers/new"
          />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <UInput
          v-model="search"
          :placeholder="t('customers.search')"
          :aria-label="t('customers.search')"
          icon="i-lucide-search"
          type="search"
          class="w-full sm:max-w-xs"
        />
      </UDashboardToolbar>
    </template>

    <template #body>
      <PageLoadError
        v-if="customers.error.value && !customers.data.value"
        :error="customers.error.value"
        @retry="customers.refresh()"
      />
      <div
        v-else-if="customers.loading.value"
        class="space-y-2"
      >
        <USkeleton
          v-for="n in 5"
          :key="n"
          class="h-14 w-full"
        />
      </div>
      <UEmpty
        v-else-if="!customers.data.value?.items.length"
        icon="i-lucide-users"
        :title="filters.search ? t('customers.noMatch') : t('customers.empty')"
        :description="filters.search ? undefined : t('customers.emptyDescription')"
        :actions="filters.search
          ? [{ label: t('common.actions.clearFilters'), color: 'neutral', variant: 'outline', onClick: clearSearch }]
          : can('customer:write') ? [{ label: t('customers.new'), icon: 'i-lucide-user-plus', to: '/customers/new' }] : []"
      />
      <template v-else>
        <ul
          class="divide-y divide-default rounded-md border border-default"
          :class="{ 'opacity-60': customers.refreshing.value }"
        >
          <li
            v-for="customer in customers.data.value.items"
            :key="customer.id"
          >
            <NuxtLink
              :to="`/customers/${customer.id}`"
              class="flex items-center justify-between gap-3 px-4 py-3 hover:bg-elevated/50"
            >
              <span class="min-w-0 font-medium break-words">{{ customer.name }}</span>
              <span class="shrink-0 text-sm text-muted tabular-nums">{{ customer.phone ? formatPhone(customer.phone) : t('customers.noPhone') }}</span>
            </NuxtLink>
          </li>
        </ul>
        <div
          v-if="customers.data.value.total > pageSize"
          class="flex justify-center"
        >
          <UPagination
            v-model:page="page"
            :total="customers.data.value.total"
            :items-per-page="pageSize"
          />
        </div>
      </template>
    </template>
  </UDashboardPanel>
</template>
