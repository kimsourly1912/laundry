<script setup lang="ts">
/**
 * One customer (D39): their name and phone, and Edit. Their orders come in the default slot (the
 * route page puts the orders feature's list there), so neither feature imports the other twice over.
 */
import type { Customer } from '#shared/contracts/customers'
import { formatPhone } from '#shared/contracts/phone'
import CustomerModal from './CustomerModal.vue'

const props = defineProps<{ customerId: string }>()

const { t } = useI18n()
const { can } = useSession()
const customer = useApiQuery(() => `customers:one:${props.customerId}`, () => apiFetch<Customer>(`/shop/customers/${props.customerId}`))
const editing = ref(false)
</script>

<template>
  <UDashboardPanel id="customer">
    <template #header>
      <UDashboardNavbar :title="customer.data.value?.name ?? t('customers.title')">
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            to="/customers"
            :aria-label="t('common.actions.back')"
          />
        </template>
        <template #right>
          <UButton
            v-if="customer.data.value && can('customer:write')"
            :label="t('customers.edit')"
            icon="i-lucide-pencil"
            color="neutral"
            variant="outline"
            data-testid="edit-customer"
            @click="editing = true"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-page space-y-4">
        <UEmpty
          v-if="customer.error.value?.kind === 'not_found'"
          icon="i-lucide-search-x"
          :title="t('customers.notFound')"
          :actions="[{ label: t('customers.title'), to: '/customers' }]"
          data-testid="customer-not-found"
        />
        <PageLoadError
          v-else-if="customer.error.value && !customer.data.value"
          :error="customer.error.value"
          @retry="customer.refresh()"
        />
        <USkeleton
          v-else-if="!customer.data.value"
          class="h-16 w-full"
        />
        <template v-else>
          <div>
            <h2 class="text-xl font-semibold break-words text-highlighted">
              {{ customer.data.value.name }}
            </h2>
            <p class="text-muted">
              {{ customer.data.value.phone ? formatPhone(customer.data.value.phone) : t('customers.noPhone') }}
            </p>
          </div>
          <section
            class="space-y-2"
            aria-labelledby="customer-orders"
          >
            <h3
              id="customer-orders"
              class="font-semibold text-highlighted"
            >
              {{ t('customers.orders') }}
            </h3>
            <slot />
          </section>
          <CustomerModal
            v-model:open="editing"
            :customer="customer.data.value"
            @saved="value => customer.data.value = value"
          />
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
