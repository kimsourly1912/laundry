<script setup lang="ts">
// Overview, Orders, then More for the rest (D27; plan step 3), as the bottom tabs of ShopShell.
// Paper slips is first in More (implementation guide → sheets 05–07).
const links = [
  { label: 'overview.nav', icon: 'i-lucide-house', to: '/' },
  { label: 'orders.list.nav', icon: 'i-lucide-receipt-text', to: '/orders' },
  { label: 'more.nav', icon: 'i-lucide-menu', to: '/more' },
]
</script>

<template>
  <ShopShell :links="links">
    <slot />
  </ShopShell>
</template>
