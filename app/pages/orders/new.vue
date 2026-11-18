<script setup lang="ts">
import { NewOrderPage } from '~/features/orders'

definePageMeta({ layout: 'shop', area: 'shop', permission: 'order:create', title: 'orders.new.title' })
</script>

<template>
  <NewOrderPage />
</template>
