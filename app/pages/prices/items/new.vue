<script setup lang="ts">
import PriceItemFormPage from '~/features/pricing/components/PriceItemFormPage.vue'

definePageMeta({ layout: 'shop', area: 'shop', permission: 'price:write', title: 'pricing.newItem' })
</script>

<template>
  <PriceItemFormPage />
</template>
