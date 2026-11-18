<script setup lang="ts">
/** A customer's orders, newest first (D39): the customer page's history. */
import type { Page } from '#shared/contracts/common'
import type { OrderListItem } from '#shared/contracts/orders'
import OrderRows from './OrderRows.vue'

const props = defineProps<{ customerId: string }>()

const { t } = useI18n()
const orders = useApiQuery(() => `orders:customer:${props.customerId}`, () => apiFetch<Page<OrderListItem>>('/shop/orders', { query: { customerId: props.customerId, pageSize: 50 } }))
</script>

<template>
  <PageLoadError
    v-if="orders.error.value && !orders.data.value"
    :error="orders.error.value"
    @retry="orders.refresh()"
  />
  <USkeleton
    v-else-if="orders.loading.value"
    class="h-16 w-full"
  />
  <p
    v-else-if="!orders.data.value?.items.length"
    class="text-sm text-muted"
  >
    {{ t('orders.customer.none') }}
  </p>
  <OrderRows
    v-else
    :orders="orders.data.value.items"
    data-testid="customer-orders"
  />
</template>
