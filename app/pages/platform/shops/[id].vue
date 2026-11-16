<script setup lang="ts">
import ShopDetailPage from '~/features/platform/components/ShopDetailPage.vue'

definePageMeta({ layout: 'platform', area: 'platform', permission: 'shop:read', title: 'platform.shop.title' })
</script>

<template>
  <ShopDetailPage :id="String($route.params.id)" />
</template>
