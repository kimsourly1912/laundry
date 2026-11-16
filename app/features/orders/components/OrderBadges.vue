<script setup lang="ts">
/** An order's status and payment, as badges (lists and the detail page). */
import type { OrderSummary } from '#shared/contracts/orders'
import { STATUS_COLOR } from '../schemas/order-status'

defineProps<{ order: Pick<OrderSummary, 'status' | 'paymentStatus'> }>()
const { t } = useI18n()
</script>

<template>
  <span class="flex flex-wrap justify-end gap-1">
    <UBadge
      :label="t(`orders.status.${order.status}`)"
      :color="STATUS_COLOR[order.status]"
      variant="subtle"
    />
    <UBadge
      v-if="order.status !== 'cancelled'"
      :label="t(`orders.payment.${order.paymentStatus}`)"
      :color="order.paymentStatus === 'paid' ? 'success' : 'warning'"
      variant="outline"
    />
  </span>
</template>
