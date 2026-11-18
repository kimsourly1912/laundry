<script setup lang="ts">
/** Customers (D39; product notes → Customers): the shop's people by name, found by name or phone. */
import type { Page } from '#shared/contracts/common'
import type { Customer } from '#shared/contracts/customers'
import { formatPhone } from '#shared/contracts/phone'
import CustomerModal from './CustomerModal.vue'

const { t } = useI18n()
const { can } = useSession()
const router = useRouter()
const { filters, page, pageSize, query } = usePaginatedQuery({ search: '' })
const search = ref(filters.search)
let typing: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(typing)
  typing = setTimeout(() => {
    filters.search = value.trim()
  }, 300)
})
onBeforeUnmount(() => clearTimeout(typing))

const customers = useApiQuery('customers:list', () => apiFetch<Page<Customer>>('/shop/customers', { query: query.value }), { watch: [query] })
const adding = ref(false)
</script>

<template>
  <UDashboardPanel id="customers">
    <template #header>
      <UDashboardNavbar :title="t('customers.title')">
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            to="/more"
            :aria-label="t('common.actions.back')"
          />
        </template>
        <template #right>
          <UButton
            v-if="can('customer:write')"
            :label="t('customers.add')"
            icon="i-lucide-plus"
            data-testid="add-customer"
            @click="adding = true"
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
      <div class="mx-auto w-full max-w-page space-y-4">
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
            v-for="n in 4"
            :key="n"
            class="h-14 w-full"
          />
        </div>
        <UEmpty
          v-else-if="!customers.data.value?.items.length"
          icon="i-lucide-users"
          :title="filters.search ? t('customers.noMatch') : t('customers.emptyTitle')"
          :description="filters.search ? undefined : t('customers.emptyDescription')"
        />
        <template v-else-if="customers.data.value">
          <ul
            class="divide-y divide-default rounded-md border border-default"
            data-testid="customers-list"
          >
            <li
              v-for="customer in customers.data.value.items"
              :key="customer.id"
              class="relative flex items-center gap-3 px-4 py-3 hover:bg-elevated/50"
            >
              <div class="flex min-w-0 flex-1 flex-col">
                <ULink
                  :to="`/customers/${customer.id}`"
                  class="font-medium break-words text-highlighted after:absolute after:inset-0"
                >
                  {{ customer.name }}
                </ULink>
                <span
                  v-if="customer.phone"
                  class="text-sm text-muted"
                >{{ formatPhone(customer.phone) }}</span>
              </div>
              <UIcon
                name="i-lucide-chevron-right"
                class="size-4 shrink-0 text-muted"
              />
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
      </div>
      <CustomerModal
        v-model:open="adding"
        @saved="customer => router.push(`/customers/${customer.id}`)"
      />
    </template>
  </UDashboardPanel>
</template>
