<script setup lang="ts">
import SlipOrderPage from '~/features/orders/components/SlipOrderPage.vue'

definePageMeta({ layout: 'shop', area: 'shop', permission: 'order:create', title: 'orders.new' })
</script>

<template>
  <SlipOrderPage />
</template>
