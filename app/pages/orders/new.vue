<script setup lang="ts">
import NewOrderPage from '~/features/orders/components/NewOrderPage.vue'

definePageMeta({ layout: 'shop', area: 'shop', permission: 'order:create', title: 'orders.new' })
</script>

<template>
  <NewOrderPage />
</template>
