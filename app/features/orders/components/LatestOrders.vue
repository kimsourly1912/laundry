<script setup lang="ts">
/**
 * Overview's latest orders (implementation guide → sheet 01), newest first: each row opens the
 * order, where its slip can be printed again. The full Orders list with search is a later screen.
 */
import type { Page } from '#shared/contracts/common'
import type { OrderListItem } from '#shared/contracts/orders'
import { formatPhone } from '#shared/contracts/phone'

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
    <ul
      v-else
      class="divide-y divide-default rounded-md border border-default"
      data-testid="latest-orders"
    >
      <li
        v-for="order in orders.data.value.items"
        :key="order.id"
        class="relative flex items-center gap-3 px-4 py-3 hover:bg-elevated/50"
      >
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <ULink
            :to="`/orders/${order.id}`"
            class="text-base font-semibold text-highlighted tabular-nums after:absolute after:inset-0"
          >
            {{ t('orders.latest.number', { number: order.number }) }}
          </ULink>
          <span class="truncate text-sm text-muted">
            {{ formatDate(order.date) }}<template v-if="order.phone"> · {{ formatPhone(order.phone) }}</template>
          </span>
        </div>
        <div class="flex shrink-0 flex-col items-end gap-1">
          <UBadge
            :label="order.paid ? t('orders.paid') : t('orders.unpaid')"
            :color="order.paid ? 'success' : 'warning'"
            variant="subtle"
          />
          <span
            v-if="order.amount !== null"
            class="text-sm tabular-nums"
          >{{ formatMoney(order.amount, order.currency) }}</span>
        </div>
        <UIcon
          name="i-lucide-chevron-right"
          class="size-4 shrink-0 text-muted"
        />
      </li>
    </ul>
  </section>
</template>
