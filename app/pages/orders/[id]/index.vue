<script setup lang="ts">
import OrderPage from '~/features/orders/components/OrderPage.vue'

definePageMeta({ layout: 'shop', area: 'shop', permission: 'order:read', title: 'orders.nav' })
</script>

<template>
  <OrderPage :id="String($route.params.id)" />
</template>
