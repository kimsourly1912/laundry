<script setup lang="ts">
import { PaperSlipsPage } from '~/features/orders'

definePageMeta({ layout: 'shop', area: 'shop', permission: 'template:read', title: 'orders.slips.title' })
</script>

<template>
  <PaperSlipsPage />
</template>
