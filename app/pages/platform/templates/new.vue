<script setup lang="ts">
import TemplateEditorPage from '~/features/platform/components/TemplateEditorPage.vue'

definePageMeta({ layout: 'platform', area: 'platform', permission: 'template:write', title: 'platform.templates.new' })
</script>

<template>
  <TemplateEditorPage />
</template>
