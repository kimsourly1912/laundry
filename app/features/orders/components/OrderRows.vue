<script setup lang="ts">
/**
 * Orders as rows (page-patterns → Row composition): the number is the link, stretched over the row;
 * the work state and the payment are separate badges; the date, phone and amount on a meta line.
 */
import type { OrderListItem } from '#shared/contracts/orders'
import { formatPhone } from '#shared/contracts/phone'
import { ORDER_STATE_BADGE, orderState } from '../utils/order-status'

defineProps<{ orders: OrderListItem[] }>()

const { t } = useI18n()
</script>

<template>
  <ul class="divide-y divide-default rounded-md border border-default">
    <li
      v-for="order in orders"
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
        <span class="text-sm break-words text-muted">
          {{ formatDate(order.date) }}<template v-if="order.phone"> · {{ formatPhone(order.phone) }}</template><template v-if="order.amount !== null"> · <span class="tabular-nums">{{ formatMoney(order.amount, order.currency) }}</span></template>
        </span>
      </div>
      <div class="flex shrink-0 flex-col items-end gap-1">
        <UBadge
          :label="t(ORDER_STATE_BADGE[orderState(order)].key)"
          :color="ORDER_STATE_BADGE[orderState(order)].color"
          variant="subtle"
        />
        <UBadge
          v-if="order.status !== 'cancelled'"
          :label="order.paid ? t('orders.paid') : t('orders.unpaid')"
          :color="order.paid ? 'success' : 'warning'"
          variant="subtle"
        />
      </div>
      <UIcon
        name="i-lucide-chevron-right"
        class="size-4 shrink-0 text-muted"
      />
    </li>
  </ul>
</template>
