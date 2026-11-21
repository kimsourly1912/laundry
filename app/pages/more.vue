<script setup lang="ts">
/**
 * More (D27): everything besides the daily pages, as one list: Paper slips and the account, and
 * contact support. The platform makes every change to the slip and the shop's details (D44).
 */
import { paperSlipsNavigation } from '~/features/orders'

definePageMeta({ layout: 'shop', area: 'shop', title: 'more.title' })

const { t } = useI18n()
const { supportUrl } = useRuntimeConfig().public
const links = computed(() => [
  ...paperSlipsNavigation.map(link => ({ label: t(link.label), icon: link.icon, to: link.to })),
  { label: t('account.page.title'), icon: 'i-lucide-circle-user', to: '/account' },
])
</script>

<template>
  <UDashboardPanel id="more">
    <template #header>
      <UDashboardNavbar
        :toggle="false"
        :title="t('more.title')"
        icon="i-lucide-menu"
      >
        <template #right>
          <UColorModeButton />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-page space-y-6">
        <ul class="divide-y divide-default rounded-md border border-default">
          <li
            v-for="link in links"
            :key="link.to"
          >
            <NuxtLink
              :to="link.to"
              class="flex items-center gap-3 px-4 py-4 hover:bg-elevated/50 focus-visible:outline-2 focus-visible:outline-primary"
            >
              <UIcon
                :name="link.icon"
                class="size-5 shrink-0 text-muted"
              />
              <span class="flex-1">{{ link.label }}</span>
              <UIcon
                name="i-lucide-chevron-right"
                class="size-4 text-muted rtl:rotate-180"
              />
            </NuxtLink>
          </li>
        </ul>

        <UPageCard
          v-if="supportUrl"
          :title="t('more.support')"
          :description="t('more.supportDescription')"
          variant="subtle"
        >
          <div>
            <UButton
              :label="t('more.contactSupport')"
              icon="i-lucide-message-circle"
              :to="supportUrl"
              target="_blank"
              rel="noopener"
              external
            />
          </div>
        </UPageCard>

        <SignOutButton
          variant="outline"
          data-testid="sign-out"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
