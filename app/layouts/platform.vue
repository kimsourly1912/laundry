<script setup lang="ts">
import { platformNavigation } from '~/features/platform'
</script>

<template>
  <AppShell
    :links="platformNavigation"
    home="/platform/shops"
  >
    <slot />
  </AppShell>
</template>
