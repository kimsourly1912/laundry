<script setup lang="ts">
/**
 * The Studio sidebar's Paper size view: the printed slip's size in millimetres. Set size picks the
 * render size in pixels from it (at most 8 px a millimetre, within the canvas limits) and hands the
 * page a new design; a paper too narrow to render at its proportions is refused with a toast.
 */
import { CANVAS_MAX_SIDE, CANVAS_MIN_SIDE, PAPER_MAX_MM, PAPER_MIN_MM } from '#shared/contracts/slip-design'
import type { SlipDesign } from '#shared/contracts/slip-design'
import { PAPER_PRESET_GROUPS, PAPER_PRESETS } from '../utils/paper-presets'

const props = defineProps<{ design: SlipDesign, readOnly: boolean }>()
const emit = defineEmits<{ change: [design: SlipDesign] }>()
const { t } = useI18n()
const toast = useToast()

const paperWidth = ref<number | null>(props.design.paper?.widthMm ?? null)
const paperHeight = ref<number | null>(props.design.paper?.heightMm ?? null)
watch(() => props.design.paper, (paper) => {
  paperWidth.value = paper?.widthMm ?? null
  paperHeight.value = paper?.heightMm ?? null
})
const unchanged = computed(() => paperWidth.value === (props.design.paper?.widthMm ?? null) && paperHeight.value === (props.design.paper?.heightMm ?? null))

/** A preset fills the two boxes; Set size still applies it, so it can be adjusted first. */
function pickPreset(preset: { widthMm: number, heightMm: number }) {
  paperWidth.value = preset.widthMm
  paperHeight.value = preset.heightMm
}

function setPaper() {
  const widthMm = paperWidth.value
  const heightMm = paperHeight.value
  if (widthMm === null || heightMm === null || [widthMm, heightMm].some(side => side < PAPER_MIN_MM || side > PAPER_MAX_MM)) return
  const factor = Math.max(CANVAS_MIN_SIDE / Math.min(widthMm, heightMm), Math.min(8, CANVAS_MAX_SIDE / Math.max(widthMm, heightMm)))
  const width = Math.round(widthMm * factor)
  const height = Math.round(heightMm * factor)
  if (width > CANVAS_MAX_SIDE || height > CANVAS_MAX_SIDE) {
    toast.add({ title: t('studio.html.paperRatio'), color: 'error' })
    return
  }
  emit('change', { ...props.design, width, height, paper: { widthMm, heightMm } })
}
</script>

<template>
  <form
    class="space-y-4"
    @submit.prevent="setPaper"
  >
    <p class="text-sm text-muted">
      {{ t('studio.paper.description') }}
    </p>
    <div
      v-if="!readOnly"
      class="space-y-3"
    >
      <fieldset
        v-for="group in PAPER_PRESET_GROUPS"
        :key="group"
        class="space-y-1.5"
      >
        <legend class="text-xs font-medium text-muted">
          {{ t(`studio.paper.groups.${group}`) }}
        </legend>
        <div class="flex flex-wrap gap-1.5">
          <UButton
            v-for="preset in PAPER_PRESETS.filter(item => item.group === group)"
            :key="preset.id"
            :label="t(`studio.paper.presets.${preset.id}`)"
            size="xs"
            color="neutral"
            :variant="paperWidth === preset.widthMm && paperHeight === preset.heightMm ? 'soft' : 'outline'"
            :aria-pressed="paperWidth === preset.widthMm && paperHeight === preset.heightMm"
            :data-testid="`paper-preset-${preset.id}`"
            @click="pickPreset(preset)"
          />
        </div>
      </fieldset>
    </div>
    <div class="grid grid-cols-2 gap-2">
      <UFormField :label="t('studio.paper.width')">
        <UInputNumber
          v-model="paperWidth"
          :min="PAPER_MIN_MM"
          :max="PAPER_MAX_MM"
          size="sm"
          :disabled="readOnly"
        />
      </UFormField>
      <UFormField :label="t('studio.paper.height')">
        <UInputNumber
          v-model="paperHeight"
          :min="PAPER_MIN_MM"
          :max="PAPER_MAX_MM"
          size="sm"
          :disabled="readOnly"
        />
      </UFormField>
    </div>
    <UButton
      v-if="!readOnly"
      type="submit"
      :label="t('studio.paper.apply')"
      color="neutral"
      variant="outline"
      block
      :disabled="!paperWidth || !paperHeight || unchanged"
    />
    <p class="text-xs text-muted tabular-nums">
      {{ t('studio.html.paperRender', { width: design.width, height: design.height }) }}
    </p>
  </form>
</template>
