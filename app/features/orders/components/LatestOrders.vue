<script setup lang="ts">
/**
 * Overview's latest orders (implementation guide → sheet 01), newest first: each row opens the
 * order, where its slip can be printed again; View all opens the Orders list.
 */
import type { Page } from '#shared/contracts/common'
import type { OrderListItem } from '#shared/contracts/orders'
import OrderRows from './OrderRows.vue'

const LATEST = 10

const { t } = useI18n()
const orders = useApiQuery('orders:latest', () => apiFetch<Page<OrderListItem>>('/shop/orders', { query: { pageSize: LATEST } }))
</script>

<template>
  <section
    class="space-y-2"
    aria-labelledby="latest-orders"
  >
    <h2
      id="latest-orders"
      class="text-lg font-semibold text-highlighted"
    >
      {{ t('orders.latest.title') }}
    </h2>
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
        v-for="n in 3"
        :key="n"
        class="h-16 w-full"
      />
    </div>
    <UEmpty
      v-else-if="!orders.data.value?.items.length"
      icon="i-lucide-receipt-text"
      :title="t('orders.latest.emptyTitle')"
      :description="t('orders.latest.emptyDescription')"
      variant="naked"
    />
    <OrderRows
      v-else
      :orders="orders.data.value.items"
      data-testid="latest-orders"
    />
    <ULink
      v-if="(orders.data.value?.total ?? 0) > LATEST"
      to="/orders"
      class="inline-block text-sm font-medium text-primary"
    >
      {{ t('orders.latest.viewAll') }}
    </ULink>
  </section>
</template>
