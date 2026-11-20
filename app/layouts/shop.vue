<script setup lang="ts">
// Fill slip, the saved-slip history, and shop settings.
const links = [
  { label: 'orders.new.title', icon: 'i-lucide-file-plus', to: '/' },
  { label: 'orders.list.nav', icon: 'i-lucide-receipt-text', to: '/orders' },
  { label: 'more.nav', icon: 'i-lucide-menu', to: '/more' },
]
</script>

<template>
  <ShopShell :links="links">
    <slot />
  </ShopShell>
</template>
