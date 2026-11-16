<script setup lang="ts">
import NewShopPage from '~/features/platform/components/NewShopPage.vue'

definePageMeta({ layout: 'platform', area: 'platform', permission: 'shop:create', title: 'platform.newShop.title' })
</script>

<template>
  <NewShopPage />
</template>
