<script setup lang="ts">
import { FillSlipPage } from '~/features/orders'

definePageMeta({ layout: 'shop', area: 'shop', permission: 'order:create', title: 'orders.new.title' })
</script>

<template>
  <FillSlipPage />
</template>
