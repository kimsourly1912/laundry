<script setup lang="ts">
/**
 * The HTML Studio's activity bar: a column on the left edge with one labelled tile per sidebar view
 * (`studio.html.sidebar.short.<value>`; the full view name stays the accessible name), the open
 * one tinted. From `lg` it and the open sidebar share one card, split by the bar's
 * edge; while the sidebar is closed the bar is a card on its own. Picking an icon is the page's call
 * (`pickSidebarView`): the open view's icon closes the sidebar, any other opens its view.
 */
import { SIDEBAR_VIEWS } from '../utils/html-sidebar'
import type { SidebarView } from '../utils/html-sidebar'

defineProps<{
  /** The view the sidebar shows, or nothing while it's closed. */
  active?: SidebarView
  /** Views hidden for this template (a read-only one has no presets or images to insert). */
  hidden: SidebarView[]
}>()
const emit = defineEmits<{ pick: [view: SidebarView] }>()
const { t } = useI18n()

const top = SIDEBAR_VIEWS.filter(view => view.place === 'top')
const bottom = SIDEBAR_VIEWS.filter(view => view.place === 'bottom')
</script>

<template>
  <nav
    class="flex w-16 shrink-0 flex-col items-center justify-between gap-2 overflow-y-auto rounded-lg border border-default bg-default py-2"
    :class="{ 'lg:rounded-e-none': active }"
    :aria-label="t('studio.html.sidebar.label')"
  >
    <ul
      v-for="(group, index) in [top, bottom]"
      :key="index"
      class="flex flex-col items-center gap-1"
    >
      <template
        v-for="view in group"
        :key="view.value"
      >
        <li v-if="!hidden.includes(view.value)">
          <!-- A tile with the icon over a short label; the open view's tile is tinted. -->
          <UButton
            :icon="view.icon"
            :label="t(`studio.html.sidebar.short.${view.value}`)"
            :color="active === view.value ? 'primary' : 'neutral'"
            :variant="active === view.value ? 'soft' : 'ghost'"
            :aria-label="t(`studio.html.sidebar.views.${view.value}`)"
            :aria-pressed="active === view.value"
            :aria-controls="active === view.value ? 'html-studio-sidebar' : undefined"
            :data-testid="`open-${view.value}`"
            :ui="{ base: 'w-13 flex-col justify-center gap-1 px-1 py-2', leadingIcon: 'size-5', label: 'text-[11px] leading-none' }"
            @click="emit('pick', view.value)"
          />
        </li>
      </template>
    </ul>
  </nav>
</template>
