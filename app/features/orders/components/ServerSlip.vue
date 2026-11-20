<script setup lang="ts">
/** Server-drawn slip artwork, loaded as an image. */
const props = defineProps<{
  /** The API path: `/shop/orders/:id/slip` or an attached template sample. */
  path: string
  width: number
  height: number
}>()

const { t } = useI18n()
const objectUrl = ref<string>()
const failed = shallowRef<unknown>()
let latest = 0

async function load() {
  const ticket = ++latest
  try {
    const blob = await apiFetch<Blob>(props.path, { responseType: 'blob' })
    if (ticket !== latest) return
    if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = URL.createObjectURL(blob)
    failed.value = undefined
  }
  catch (error) {
    if (ticket === latest) failed.value = error
  }
}
watch(() => props.path, load, { immediate: true })
onBeforeUnmount(() => {
  latest++
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
})
</script>

<template>
  <div
    class="relative h-full w-full"
    :style="{ aspectRatio: `${width} / ${height}` }"
  >
    <img
      v-if="objectUrl"
      :src="objectUrl"
      :alt="t('orders.slip.label')"
      class="h-full w-full"
      data-testid="server-slip"
    >
    <PageLoadError
      v-else-if="failed"
      :error="failed"
      @retry="load"
    />
    <USkeleton
      v-else
      class="h-full w-full"
    />
  </div>
</template>
