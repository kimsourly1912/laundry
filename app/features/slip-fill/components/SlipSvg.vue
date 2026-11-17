<script setup lang="ts">
/**
 * A slip drawn by the shared SVG builder (plan §6.2), as inline SVG: the same markup the server
 * turns into the customer's PNG. Inline, not `<img>`, so the slip's images load from our API with the
 * session. The markup is parsed as SVG and put in place, never as HTML (no `v-html`): the builder
 * escapes every value it writes and emits no scripts.
 */
import type { SlipData, SlipDesign } from '#shared/contracts/slip-design'
import { slipSvg } from '#shared/slip/svg'
import type { SlipText } from '#shared/slip/text'

const props = defineProps<{
  design: SlipDesign
  data: SlipData
  text: SlipText
  /** Unique on the page when several slips are shown. */
  idPrefix?: string
  /** Where an image's bytes are: the platform's images by default (the studio). */
  imageHref?: (imageId: string) => string
}>()

const host = ref<HTMLElement>()

const markup = computed(() => slipSvg({
  design: props.design,
  data: props.data,
  text: props.text,
  imageHref: props.imageHref ?? (id => `/api/platform/images/${id}`),
  idPrefix: props.idPrefix,
}))

watch([markup, host], ([svg, element]) => {
  if (!element) return
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement
  parsed.setAttribute('width', '100%')
  parsed.setAttribute('height', '100%')
  parsed.setAttribute('aria-hidden', 'true')
  element.replaceChildren(document.importNode(parsed, true))
}, { immediate: true, flush: 'post' })
</script>

<template>
  <div
    ref="host"
    class="size-full"
  />
</template>
