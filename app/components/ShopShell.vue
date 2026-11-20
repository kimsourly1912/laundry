<script setup lang="ts">
/**
 * The owner's shell (docs/standards/responsive-layout.md → Application shell): a phone-sized app
 * at every width. One centred column up to `max-w-page` (768px), no sidebar; the destinations are a
 * bottom tab bar on the top-level pages. A page one level down (a saved slip) hides the tabs,
 * has a Back button, and may bring its own `<BottomBar>` for its primary action.
 */
import type { ShellLink } from './AppShell.vue'

const props = defineProps<{ links: ShellLink[] }>()

const { t } = useI18n()
const route = useRoute()

const tabs = computed(() => props.links.map(link => ({
  ...link,
  label: t(link.label),
  active: link.to === '/' ? route.path === '/' : route.path === link.to || route.path.startsWith(`${link.to}/`),
})))
// Tabs only on the destinations themselves: the one bottom bar at a time is the page's action bar elsewhere.
const showTabs = computed(() => props.links.some(link => link.to === route.path))
</script>

<template>
  <UDashboardGroup
    unit="rem"
    data-shell-gutter
    :data-tabs="showTabs || undefined"
  >
    <slot />
  </UDashboardGroup>

  <nav
    v-if="showTabs"
    :aria-label="t('app.navigation')"
    class="fixed inset-x-0 bottom-0 z-20 border-t border-default bg-default/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
  >
    <ul class="mx-auto flex w-full max-w-page">
      <li
        v-for="tab in tabs"
        :key="tab.to"
        class="flex-1"
      >
        <NuxtLink
          :to="tab.to"
          :aria-current="tab.active ? 'page' : undefined"
          class="flex min-h-15 flex-col items-center justify-center gap-1 px-2 text-xs font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          :class="tab.active ? 'text-primary' : 'text-muted hover:text-highlighted'"
          :data-testid="`tab-${tab.to === '/' ? 'fill-slip' : tab.to.slice(1)}`"
        >
          <UIcon
            :name="tab.icon"
            class="size-6 shrink-0"
          />
          {{ tab.label }}
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
