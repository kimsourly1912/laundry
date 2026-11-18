<script setup lang="ts">
import { PricesPage } from '~/features/prices'

definePageMeta({ layout: 'shop', area: 'shop', permission: 'price:read', title: 'prices.title' })
</script>

<template>
  <PricesPage />
</template>
