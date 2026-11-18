<script setup lang="ts">
import RequestsPage from '~/features/studio/components/RequestsPage.vue'

definePageMeta({ layout: 'platform', area: 'platform', permission: 'template:read', title: 'studio.requests.title' })
</script>

<template>
  <RequestsPage />
</template>
