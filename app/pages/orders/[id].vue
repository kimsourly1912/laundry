<script setup lang="ts">
import { OrderPage } from '~/features/orders'

definePageMeta({ layout: 'shop', area: 'shop', permission: 'order:read', title: 'orders.order.loadingTitle' })

const route = useRoute()
const orderId = computed(() => String(route.params.id))
</script>

<template>
  <OrderPage
    :key="orderId"
    :order-id="orderId"
  />
</template>
