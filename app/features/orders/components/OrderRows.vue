<script setup lang="ts">
/** Orders as rows that open the order (a customer's history). Never a sideways table. */
import type { OrderSummary } from '#shared/contracts/orders'
import { customerLabel } from '../schemas/slip-form'
import OrderBadges from './OrderBadges.vue'

defineProps<{ orders: OrderSummary[], dim?: boolean }>()
const { t, locale } = useI18n()
</script>

<template>
  <ul
    class="divide-y divide-default rounded-md border border-default"
    :class="{ 'opacity-60': dim }"
  >
    <li
      v-for="order in orders"
      :key="order.id"
    >
      <NuxtLink
        :to="`/orders/${order.id}`"
        class="flex items-start justify-between gap-3 px-4 py-3 hover:bg-elevated/50 focus-visible:outline-2 focus-visible:outline-primary"
      >
        <div class="min-w-0 space-y-0.5">
          <p class="font-medium break-words">
            <span class="tabular-nums">#{{ order.number }}</span> · {{ customerLabel(order.customer, t) }}
          </p>
          <p class="text-sm text-muted tabular-nums">
            {{ formatMoney(order.total, order.currency, locale) }} · {{ formatDate(order.createdAt, locale) }}
          </p>
        </div>
        <OrderBadges
          :order="order"
          class="shrink-0"
        />
      </NuxtLink>
    </li>
  </ul>
</template>
