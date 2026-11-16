<script setup lang="ts">
/**
 * The signed-in shell (docs/standards/responsive-layout.md → Application shell): Nuxt UI's
 * dashboard with the layout's navigation, and the account menu. Below `lg` the sidebar is a drawer.
 */
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'
import { useSignOut } from '~/features/account'

export interface ShellLink {
  /** i18n key. */
  label: string
  icon: string
  to: string
}

const props = defineProps<{ links: ShellLink[], home: string }>()

const { t } = useI18n()
const route = useRoute()
const { me } = useSession()
const { signOut } = useSignOut()
const open = ref(false)

const items = computed<NavigationMenuItem[]>(() => props.links.map(link => ({
  label: t(link.label),
  icon: link.icon,
  to: link.to,
  active: link.to === '/' ? route.path === '/' : route.path === link.to || route.path.startsWith(`${link.to}/`),
  onSelect: () => {
    open.value = false
  },
})))

const menu = computed<DropdownMenuItem[][]>(() => [
  [{ label: me.value?.user.username ?? '', type: 'label' }],
  [{ label: t('account.page.title'), icon: 'i-lucide-circle-user', to: '/account' }],
  [{ label: t('common.actions.signOut'), icon: 'i-lucide-log-out', onSelect: () => signOut() }],
])
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      v-model:open="open"
      collapsible
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink
          :to="home"
          class="flex items-center gap-2 font-semibold"
        >
          <UIcon
            name="i-lucide-shirt"
            class="size-5 shrink-0 text-primary"
          />
          <span
            v-if="!collapsed"
            class="min-w-0 break-words"
          >{{ me?.shop?.name ?? t('app.name') }}</span>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="items"
          orientation="vertical"
          tooltip
        />
      </template>

      <template #footer="{ collapsed }">
        <UDropdownMenu
          :items="menu"
          :content="{ align: 'start' }"
          class="w-full"
        >
          <UButton
            :label="collapsed ? undefined : (me?.user.name || me?.user.username || '')"
            :aria-label="collapsed ? t('account.page.title') : undefined"
            icon="i-lucide-circle-user"
            color="neutral"
            variant="ghost"
            block
            :square="collapsed"
            class="justify-start"
          />
        </UDropdownMenu>
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
