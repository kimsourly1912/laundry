<script setup lang="ts">
import PriceListPage from '~/features/pricing/components/PriceListPage.vue'

definePageMeta({ layout: 'shop', area: 'shop', permission: 'price:read', title: 'pricing.title' })
</script>

<template>
  <PriceListPage />
</template>
