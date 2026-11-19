<script setup lang="ts">
/**
 * The Studio sidebar's Presets view: one card per starter slip with the server's preview of it on the
 * typical sample, at the draft's current paper size. A preset fills an empty template only, so the
 * cards are disabled, with the reason, once the markup has content.
 */
import { HTML_INTAKE_PRESETS } from '#shared/contracts/slip-design'
import type { HtmlIntakePreset, SlipDesign } from '#shared/contracts/slip-design'
import { newHtmlSlip } from '#shared/html-slip/presets'

const props = defineProps<{ size: Pick<SlipDesign, 'width' | 'height' | 'paper'>, disabled: boolean }>()
const emit = defineEmits<{ pick: [preset: HtmlIntakePreset] }>()

const { t } = useI18n()
const previews = shallowRef<Partial<Record<HtmlIntakePreset, string>>>({})
let loadedFor = ''

async function loadPreviews() {
  const key = `${props.size.width}x${props.size.height}`
  if (loadedFor === key) return
  loadedFor = key
  revoke()
  await Promise.all(HTML_INTAKE_PRESETS.map(async (preset) => {
    try {
      const blob = await apiFetch<Blob>('/platform/templates/preview', {
        method: 'POST',
        body: { design: { ...newHtmlSlip(preset), ...props.size }, sample: 'typical' },
        responseType: 'blob',
      })
      if (loadedFor !== key) return
      previews.value = { ...previews.value, [preset]: URL.createObjectURL(blob) }
    }
    catch {
      // The card still works without its picture.
      if (loadedFor === key) loadedFor = ''
    }
  }))
}
function revoke() {
  for (const url of Object.values(previews.value)) URL.revokeObjectURL(url)
  previews.value = {}
}
watch(() => [props.size.width, props.size.height], () => void loadPreviews(), { immediate: true })
onBeforeUnmount(revoke)

const ICONS: Record<HtmlIntakePreset, string> = { byWeight: 'i-lucide-weight', byItem: 'i-lucide-shirt', mixed: 'i-lucide-layout-grid' }
/** The counts and weights staff enter with each preset, by label. */
const presetFields = Object.fromEntries(HTML_INTAKE_PRESETS.map(preset => [
  preset,
  newHtmlSlip(preset).elements.filter(element => element.type === 'number').map(element => element.label).join(' · '),
])) as Record<HtmlIntakePreset, string>
</script>

<template>
  <div class="space-y-4">
    <p class="text-sm text-muted">
      {{ t('studio.html.presetPicker.description') }}
    </p>
    <p
      v-if="disabled"
      class="flex gap-2 text-sm text-muted"
      data-testid="presets-locked"
    >
      <UIcon
        name="i-lucide-info"
        class="mt-0.5 size-4 shrink-0"
      />
      {{ t('studio.html.presetPicker.locked') }}
    </p>
    <ul class="space-y-3">
      <li
        v-for="preset in HTML_INTAKE_PRESETS"
        :key="preset"
      >
        <button
          type="button"
          class="group flex w-full flex-col overflow-hidden rounded-lg border border-default bg-default text-start transition-colors enabled:hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-75"
          :disabled="disabled"
          :data-testid="`preset-${preset}`"
          @click="emit('pick', preset)"
        >
          <!-- The slip on the same dotted canvas as the Studio's preview. -->
          <div class="flex w-full items-center justify-center border-b border-default bg-muted bg-[radial-gradient(var(--ui-border-accented)_1px,transparent_1px)] bg-size-[14px_14px] p-4">
            <div
              class="w-full"
              :style="{ aspectRatio: `${size.width} / ${size.height}` }"
            >
              <img
                v-if="previews[preset]"
                :src="previews[preset]"
                alt=""
                class="block size-full bg-white shadow-sm"
              >
              <USkeleton
                v-else
                class="size-full"
              />
            </div>
          </div>
          <div class="flex items-start gap-2 p-3">
            <UIcon
              :name="ICONS[preset]"
              class="mt-0.5 size-4 shrink-0 text-primary"
            />
            <span class="min-w-0 flex-1 space-y-1">
              <span class="block text-sm font-semibold text-highlighted">{{ t(`studio.html.presets.${preset}`) }}</span>
              <span class="block text-xs text-muted">{{ t(`studio.html.presetPicker.hints.${preset}`) }}</span>
              <span class="block text-xs text-dimmed">{{ t('studio.html.presetPicker.fields', { fields: presetFields[preset] }) }}</span>
            </span>
          </div>
        </button>
      </li>
    </ul>
  </div>
</template>
