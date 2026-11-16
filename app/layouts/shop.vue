<script setup lang="ts">
import { todayNavigation } from '~/features/today'

// Each shop feature's navigation.ts, in the order of the sidebar (responsive-layout → Navigation).
const links = [...todayNavigation]
</script>

<template>
  <AppShell
    :links="links"
    home="/"
  >
    <slot />
  </AppShell>
</template>
