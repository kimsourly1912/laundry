<script setup lang="ts">
import TemplateEditorPage from '~/features/platform/components/TemplateEditorPage.vue'

definePageMeta({ layout: 'platform', area: 'platform', permission: 'template:read', title: 'platform.templates.title' })
</script>

<template>
  <TemplateEditorPage
    :id="String($route.params.id)"
    :key="String($route.params.id)"
  />
</template>
