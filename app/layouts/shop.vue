<script setup lang="ts">
// Overview, then More for the rest (D27). The owner portal adds Templates and Orders (plan step 3).
const links = [
  { label: 'overview.nav', icon: 'i-lucide-house', to: '/' },
  { label: 'more.nav', icon: 'i-lucide-menu', to: '/more' },
]
</script>

<template>
  <AppShell
    :links="links"
    home="/"
  >
    <slot />
  </AppShell>
</template>
