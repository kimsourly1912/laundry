<script setup lang="ts">
import TemplateListPage from '~/features/studio/components/TemplateListPage.vue'

definePageMeta({ layout: 'platform', area: 'platform', permission: 'template:read', title: 'studio.list.title' })
</script>

<template>
  <TemplateListPage />
</template>
