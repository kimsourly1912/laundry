<script setup lang="ts">
import OrderListPage from '~/features/orders/components/OrderListPage.vue'

definePageMeta({ layout: 'shop', area: 'shop', permission: 'order:read', title: 'orders.listTitle' })
</script>

<template>
  <OrderListPage />
</template>
