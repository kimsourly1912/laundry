<script setup lang="ts">
import OrdersBoardPage from '~/features/orders/components/OrdersBoardPage.vue'

definePageMeta({ layout: 'shop', area: 'shop', permission: 'order:read', title: 'orders.listTitle' })
</script>

<template>
  <OrdersBoardPage />
</template>
