<script setup lang="ts">
import ServiceTypeFormPage from '~/features/pricing/components/ServiceTypeFormPage.vue'
import { providePlatformPriceScope } from '~/features/pricing'

definePageMeta({ layout: 'platform', area: 'platform', permission: 'price:write', title: 'pricing.editServiceType' })
providePlatformPriceScope(String(useRoute().params.id))
</script>

<template>
  <ServiceTypeFormPage :id="String($route.params.typeId)" />
</template>
