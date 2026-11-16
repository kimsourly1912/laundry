<script setup lang="ts">
import ShopListPage from '~/features/platform/components/ShopListPage.vue'

definePageMeta({ layout: 'platform', area: 'platform', permission: 'shop:read', title: 'platform.shops.title' })
</script>

<template>
  <ShopListPage />
</template>
