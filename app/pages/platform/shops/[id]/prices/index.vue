<script setup lang="ts">
import PriceListPage from '~/features/pricing/components/PriceListPage.vue'
import { providePlatformPriceScope } from '~/features/pricing'

definePageMeta({ layout: 'platform', area: 'platform', permission: 'price:read', title: 'pricing.title' })
providePlatformPriceScope(String(useRoute().params.id))
</script>

<template>
  <PriceListPage />
</template>
