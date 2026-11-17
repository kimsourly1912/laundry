<script setup lang="ts">
import type { TemplateDetail } from '#shared/contracts/templates'
import StudioPage from '~/features/studio/components/StudioPage.vue'

// The studio is full screen: no shell (plan §5.1).
definePageMeta({ layout: false, area: 'platform', permission: 'template:read', title: 'studio.title' })

const route = useRoute()
const id = computed(() => String(route.params.id))
const template = useApiQuery(() => `studio:template:${id.value}`, () => apiFetch<TemplateDetail>(`/platform/templates/${id.value}`))
</script>

<template>
  <div
    v-if="template.loading.value"
    class="flex h-dvh items-center justify-center"
  >
    <USkeleton class="size-64" />
  </div>
  <div
    v-else-if="template.error.value || !template.data.value"
    class="flex h-dvh items-center justify-center p-6"
  >
    <PageLoadError
      :error="template.error.value"
      @retry="template.refresh()"
    />
  </div>
  <StudioPage
    v-else
    :key="template.data.value.id"
    :template="template.data.value"
  />
</template>
