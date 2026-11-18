<script setup lang="ts">
/**
 * A filled slip as the customer gets it (plan §6.2): the shared SVG builder's drawing, fitted to the
 * screen's width, with a Zoom toggle for small labels. Before the order is saved its number is the
 * server's, so the Order No. box shows a placeholder (implementation guide → sheet 01). The slip
 * is also what prints (`print-slip`, app/assets/css/tailwind.css).
 */
import type { SlipData, SlipDesign } from '#shared/contracts/slip-design'
import type { SlipText } from '#shared/slip/text'
import { SlipSvg } from '~/features/slip-fill'

const props = defineProps<{
  design: SlipDesign
  data: SlipData
  text: SlipText
  imageHref: (imageId: string) => string
}>()

const { t } = useI18n()
const zoomed = ref(false)

/** The Order No. box, while the order has no number yet. */
const numberBox = computed(() => (props.data.order.number === null ? props.design.elements.find(element => element.type === 'orderNo') : undefined))
const percent = (value: number, of: number) => `${value / of * 100}%`
</script>

<template>
  <div class="space-y-2">
    <div
      class="overflow-auto rounded-md border border-default bg-elevated/50"
      :class="zoomed ? 'max-h-[70vh]' : ''"
    >
      <div
        class="print-slip relative bg-white shadow-sm"
        :style="{ aspectRatio: `${design.width} / ${design.height}`, width: zoomed ? `${design.width}px` : '100%' }"
        role="img"
        :aria-label="t('orders.slip.label')"
        data-testid="order-slip"
      >
        <SlipSvg
          :design="design"
          :data="data"
          :text="text"
          :image-href="imageHref"
          id-prefix="order-"
        />
        <div
          v-if="numberBox"
          class="absolute flex items-center justify-center rounded-sm border-2 border-dashed border-primary/60 bg-primary/5 text-[clamp(0.625rem,2.5vw,0.875rem)] font-medium text-primary print:hidden"
          :style="{ left: percent(numberBox.x, design.width), top: percent(numberBox.y, design.height), width: percent(numberBox.w, design.width), height: percent(numberBox.h, design.height) }"
          role="img"
          :aria-label="t('orders.slip.numberPlaceholderLabel')"
          data-testid="number-placeholder"
        >
          {{ t('orders.slip.numberPlaceholder') }}
        </div>
      </div>
    </div>
    <div class="flex justify-end print:hidden">
      <UButton
        :label="zoomed ? t('orders.slip.fit') : t('orders.slip.zoom')"
        :icon="zoomed ? 'i-lucide-minimize-2' : 'i-lucide-zoom-in'"
        color="neutral"
        variant="ghost"
        size="sm"
        :aria-pressed="zoomed"
        @click="zoomed = !zoomed"
      />
    </div>
  </div>
</template>
