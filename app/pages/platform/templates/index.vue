<script setup lang="ts">
import TemplateListPage from '~/features/platform/components/TemplateListPage.vue'

definePageMeta({ layout: 'platform', area: 'platform', permission: 'template:read', title: 'platform.templates.title' })
</script>

<template>
  <TemplateListPage />
</template>
