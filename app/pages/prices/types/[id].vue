<script setup lang="ts">
import ServiceTypeFormPage from '~/features/pricing/components/ServiceTypeFormPage.vue'

definePageMeta({ layout: 'shop', area: 'shop', permission: 'price:write', title: 'pricing.editServiceType' })
</script>

<template>
  <ServiceTypeFormPage :id="String($route.params.id)" />
</template>
