<script setup lang="ts">
/** A customer's orders, newest first (spec §4 → Customer: order history), on the customer page. */
import type { Page } from '#shared/contracts/common'
import type { OrderSummary } from '#shared/contracts/orders'
import OrderRows from './OrderRows.vue'

const props = defineProps<{ customerId: string }>()
const { t } = useI18n()
const PAGE_SIZE = 10
const orders = useApiQuery(() => `orders:customer:${props.customerId}`, () => apiFetch<Page<OrderSummary>>('/shop/orders', { query: { customerId: props.customerId, pageSize: PAGE_SIZE } }))
</script>

<template>
  <section class="space-y-2">
    <h2 class="font-semibold">
      {{ t('orders.customerHistory') }}
    </h2>
    <PageLoadError
      v-if="orders.error.value && !orders.data.value"
      :error="orders.error.value"
      @retry="orders.refresh()"
    />
    <USkeleton
      v-else-if="!orders.data.value"
      class="h-16 w-full"
    />
    <p
      v-else-if="!orders.data.value.items.length"
      class="text-sm text-muted"
    >
      {{ t('orders.customerNone') }}
    </p>
    <template v-else>
      <OrderRows :orders="orders.data.value.items" />
      <p
        v-if="orders.data.value.total > PAGE_SIZE"
        class="text-sm text-muted"
      >
        {{ t('orders.customerMore', { count: orders.data.value.total - PAGE_SIZE }) }}
      </p>
    </template>
  </section>
</template>
