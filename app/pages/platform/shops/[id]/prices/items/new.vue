<script setup lang="ts">
import PriceItemFormPage from '~/features/pricing/components/PriceItemFormPage.vue'
import { providePlatformPriceScope } from '~/features/pricing'

definePageMeta({ layout: 'platform', area: 'platform', permission: 'price:write', title: 'pricing.newItem' })
providePlatformPriceScope(String(useRoute().params.id))
</script>

<template>
  <PriceItemFormPage />
</template>
