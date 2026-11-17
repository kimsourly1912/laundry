<script setup lang="ts">
/** Account (spec §4): change password, "sign out other devices". */
import ChangePasswordForm from './ChangePasswordForm.vue'

const { t } = useI18n()
const { me } = useSession()

interface SessionRow {
  token: string
}
const sessions = useApiQuery('account:sessions', () => apiFetch<SessionRow[]>('/auth/list-sessions'))
// The list includes this device.
const others = computed(() => Math.max(0, (sessions.data.value?.length ?? 1) - 1))

const signOutOthers = useMutation(() => apiFetch('/auth/revoke-other-sessions', { method: 'POST', body: {} }), {
  invalidate: ['account'],
  success: () => t('account.page.signedOutOthers'),
})
</script>

<template>
  <UDashboardPanel id="account">
    <template #header>
      <UDashboardNavbar :title="t('account.page.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-page space-y-6">
        <p class="text-sm text-muted">
          {{ t('account.page.signedInAs', { username: me?.user.username }) }}
        </p>

        <UPageCard
          :title="t('account.changePassword.title')"
          variant="subtle"
        >
          <ChangePasswordForm @changed="sessions.refresh()" />
        </UPageCard>

        <UPageCard
          :title="t('account.page.devices')"
          variant="subtle"
        >
          <PageLoadError
            v-if="sessions.error.value"
            :error="sessions.error.value"
            @retry="sessions.refresh()"
          />
          <USkeleton
            v-else-if="sessions.loading.value"
            class="h-5 w-48"
          />
          <p
            v-else
            class="text-sm"
          >
            {{ t('account.page.devicesCount', others) }}
          </p>
          <UButton
            :label="t('account.page.signOutOthers')"
            icon="i-lucide-monitor-smartphone"
            color="neutral"
            variant="outline"
            :disabled="!others"
            :loading="signOutOthers.pending.value"
            class="self-start"
            @click="signOutOthers.execute(undefined)"
          />
        </UPageCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
