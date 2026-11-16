<script setup lang="ts">
import SettingsPage from '~/features/shop-settings/components/SettingsPage.vue'

definePageMeta({ layout: 'shop', area: 'shop', permission: 'shop:read', title: 'settings.title' })
</script>

<template>
  <SettingsPage />
</template>
