<script setup lang="ts">
/**
 * An HTML slip as the server draws it (D39): Satori's SVG, shown as an image, never as markup. The
 * same drawing goes to Telegram (as a PNG) and to print. Loaded again when what it shows changes.
 */
const props = defineProps<{
  /** The API path: `/shop/orders/:id/slip?…`, or `/shop/orders/preview` with a body. */
  path: string
  body?: unknown
  width: number
  height: number
}>()

const { t, te } = useI18n()
const objectUrl = ref<string>()
const failed = shallowRef<unknown>()
let latest = 0

async function load() {
  const ticket = ++latest
  try {
    const blob = await apiFetch<Blob>(props.path, { method: props.body === undefined ? 'GET' : 'POST', body: props.body as Record<string, unknown> | undefined, responseType: 'blob' })
    if (ticket !== latest) return
    if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = URL.createObjectURL(blob)
    failed.value = undefined
  }
  catch (error) {
    if (ticket === latest) failed.value = error
  }
}
watch(() => [props.path, JSON.stringify(props.body ?? null)], load, { immediate: true })
onBeforeUnmount(() => {
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
    <p
      v-else-if="failed"
      class="flex h-full items-center justify-center p-4 text-sm text-error"
      role="alert"
    >
      {{ errorText(failed, t, te) }}
    </p>
    <USkeleton
      v-else
      class="h-full w-full"
    />
  </div>
</template>
