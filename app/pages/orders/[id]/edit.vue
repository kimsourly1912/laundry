<script setup lang="ts">
import OrderEditPage from '~/features/orders/components/OrderEditPage.vue'

definePageMeta({ layout: 'shop', area: 'shop', permission: 'order:update', title: 'orders.nav' })
</script>

<template>
  <OrderEditPage :id="String($route.params.id)" />
</template>
