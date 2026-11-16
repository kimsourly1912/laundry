<script setup lang="ts">
import { ordersNavigation } from '~/features/orders'

// The shop's two daily pages, then More for the rest (D27).
const links = [...ordersNavigation, { label: 'more.nav', icon: 'i-lucide-menu', to: '/more' }]
</script>

<template>
  <AppShell
    :links="links"
    home="/"
  >
    <slot />
  </AppShell>
</template>
