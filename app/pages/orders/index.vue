<script setup lang="ts">
import { OrdersPage } from '~/features/orders'

definePageMeta({ layout: 'shop', area: 'shop', permission: 'order:read', title: 'orders.list.title' })
</script>

<template>
  <OrdersPage />
</template>
