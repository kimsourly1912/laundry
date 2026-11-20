<script setup lang="ts">
import type { OrderListItem } from '#shared/contracts/orders'
import { formatPhone } from '#shared/contracts/phone'

defineProps<{ orders: OrderListItem[] }>()

const { t } = useI18n()
</script>

<template>
  <ul class="divide-y divide-default overflow-hidden rounded-xl border border-default">
    <li
      v-for="order in orders"
      :key="order.id"
      class="relative flex items-center gap-3 px-4 py-3.5 hover:bg-elevated/50"
    >
      <div class="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-6">
        <div class="flex flex-col gap-0.5 sm:w-40 sm:shrink-0">
          <ULink
            :to="`/orders/${order.id}`"
            class="text-base font-semibold text-highlighted tabular-nums after:absolute after:inset-0"
          >
            {{ t('orders.latest.number', { number: order.number }) }}
          </ULink>
          <span class="text-sm text-muted">{{ formatDate(order.date) }}</span>
        </div>
        <div class="flex min-w-0 flex-col gap-0.5">
          <span
            v-if="order.customerName"
            class="text-sm font-medium break-words text-highlighted"
          >{{ order.customerName }}</span>
          <span
            v-if="order.phone || order.amount !== null"
            class="text-sm break-words text-muted"
          >
            <template v-if="order.phone">{{ formatPhone(order.phone) }}</template><template v-if="order.phone && order.amount !== null"> · </template><span
              v-if="order.amount !== null"
              class="tabular-nums"
            >{{ formatMoney(order.amount, order.currency) }}</span>
          </span>
        </div>
      </div>
      <UIcon
        name="i-lucide-chevron-right"
        class="size-4 shrink-0 text-muted"
      />
    </li>
  </ul>
</template>
