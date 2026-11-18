<script setup lang="ts">
/**
 * Overview's counts (product notes → Overview; implementation guide → sheet 01): received today,
 * in progress, ready for pickup, unpaid. Each opens the matching orders. They may overlap (an order
 * can be ready and unpaid); "today" is the shop's day, from the server.
 */
import type { OrderOverview } from '#shared/contracts/orders'

const { t } = useI18n()
const overview = useApiQuery('orders:overview', () => apiFetch<OrderOverview>('/shop/orders/overview'))

const cards = computed(() => {
  const value = overview.data.value
  return [
    { key: 'receivedToday', label: t('orders.overview.receivedToday'), icon: 'i-lucide-inbox', count: value?.receivedToday, to: '/orders' },
    { key: 'inProgress', label: t('orders.overview.inProgress'), icon: 'i-lucide-refresh-cw', count: value?.inProgress, to: '/orders?status=in_progress' },
    { key: 'ready', label: t('orders.overview.ready'), icon: 'i-lucide-circle-check', count: value?.ready, to: '/orders?status=ready' },
    { key: 'unpaid', label: t('orders.overview.unpaid'), icon: 'i-lucide-wallet', count: value?.unpaid, to: '/orders?paid=false' },
  ]
})
</script>

<template>
  <section
    :aria-label="t('orders.overview.counts')"
    class="grid grid-cols-2 gap-3"
    data-testid="overview-counts"
  >
    <PageLoadError
      v-if="overview.error.value && !overview.data.value"
      class="col-span-2"
      :error="overview.error.value"
      @retry="overview.refresh()"
    />
    <template v-else>
      <NuxtLink
        v-for="card in cards"
        :key="card.key"
        :to="card.to"
        class="flex flex-col gap-1 rounded-md border border-default p-3 hover:bg-elevated/50 focus-visible:outline-2 focus-visible:outline-primary"
        :data-testid="`count-${card.key}`"
      >
        <span class="flex items-center gap-2 text-sm text-muted">
          <UIcon
            :name="card.icon"
            class="size-4 shrink-0"
          />
          {{ card.label }}
        </span>
        <USkeleton
          v-if="card.count === undefined"
          class="h-8 w-10"
        />
        <span
          v-else
          class="text-3xl font-semibold text-highlighted tabular-nums"
        >{{ card.count }}</span>
      </NuxtLink>
    </template>
  </section>
</template>
