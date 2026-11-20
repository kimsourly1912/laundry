<script setup lang="ts">
import { SavedSlipsPage } from '~/features/orders'

definePageMeta({ layout: 'shop', area: 'shop', permission: 'order:read', title: 'orders.list.title' })
</script>

<template>
  <SavedSlipsPage />
</template>
