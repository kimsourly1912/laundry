<script setup lang="ts">
/**
 * The HTML Studio's activity bar, as in VS Code: a column of icons on the left edge, one per sidebar
 * view, the open one marked by a bar on its edge. Picking an icon is the page's call
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
    class="flex w-12 shrink-0 flex-col items-center justify-between gap-2 border-e border-default bg-elevated/50 py-2"
    :aria-label="t('studio.html.sidebar.label')"
  >
    <ul
      v-for="(group, index) in [top, bottom]"
      :key="index"
      class="flex flex-col items-center gap-2"
    >
      <template
        v-for="view in group"
        :key="view.value"
      >
        <li
          v-if="!hidden.includes(view.value)"
          class="relative flex"
        >
          <!-- VS Code's marker for the open view: a bar on the bar's outer edge. -->
          <span
            v-if="active === view.value"
            class="absolute inset-y-1 -inset-s-2 w-0.5 rounded-full bg-primary"
            aria-hidden="true"
          />
          <UTooltip
            :text="t(`studio.html.sidebar.views.${view.value}`)"
            :content="{ side: 'right' }"
          >
            <UButton
              :icon="view.icon"
              :color="active === view.value ? 'primary' : 'neutral'"
              :variant="active === view.value ? 'soft' : 'ghost'"
              :aria-label="t(`studio.html.sidebar.views.${view.value}`)"
              :aria-pressed="active === view.value"
              :aria-controls="active === view.value ? 'html-studio-sidebar' : undefined"
              :data-testid="`open-${view.value}`"
              @click="emit('pick', view.value)"
            />
          </UTooltip>
        </li>
      </template>
    </ul>
  </nav>
</template>
