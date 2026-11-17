<script setup lang="ts">
/**
 * The Shop info tab (plan §5.4.4): the shop's name, phone, address and logo, drawn from the copy of
 * the shop's details each order keeps (D33). The studio shows a sample shop.
 */
import type { ShopInfo } from '#shared/contracts/slip-design'
import { createElement, newKey } from '#shared/slip/elements'
import type { StudioEditor } from '../composables/useStudioEditor'
import { addElements } from '../utils/design-ops'

const props = defineProps<{ editor: StudioEditor }>()
const { t } = useI18n()
const { editor } = props

const ITEMS: { info: ShopInfo, icon: string }[] = [
  { info: 'name', icon: 'i-lucide-store' },
  { info: 'phone', icon: 'i-lucide-phone' },
  { info: 'address', icon: 'i-lucide-map-pin' },
  { info: 'logo', icon: 'i-lucide-image' },
]

function add(info: ShopInfo) {
  const element = createElement('shopInfo', { id: newKey(), name: t(`studio.shopInfo.${info}`), ...(info === 'logo' ? { w: 160, h: 160 } : {}) }, { info })
  editor.apply(addElements(editor.design.value, [element]))
  editor.select([element.id])
}
</script>

<template>
  <div class="space-y-3">
    <h2 class="px-1 text-sm font-semibold">
      {{ t('studio.tabs.shop') }}
    </h2>
    <p class="px-1 text-xs text-muted">
      {{ t('studio.shopInfo.hint') }}
    </p>
    <div class="grid gap-2">
      <UButton
        v-for="item in ITEMS"
        :key="item.info"
        :icon="item.icon"
        :label="t(`studio.shopInfo.${item.info}`)"
        color="neutral"
        variant="outline"
        class="justify-start"
        @click="add(item.info)"
      />
    </div>
  </div>
</template>
