<script setup lang="ts">
import PriceItemFormPage from '~/features/pricing/components/PriceItemFormPage.vue'

definePageMeta({ layout: 'shop', area: 'shop', permission: 'price:write', title: 'pricing.editItem' })
</script>

<template>
  <PriceItemFormPage :id="String($route.params.id)" />
</template>
