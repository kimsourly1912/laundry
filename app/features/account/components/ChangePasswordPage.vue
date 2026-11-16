<script setup lang="ts">
/** The forced change after a temporary password (spec P4), or a change asked for: then onward. */
import ChangePasswordForm from './ChangePasswordForm.vue'

const { t } = useI18n()
const route = useRoute()
const session = useSession()
const forced = computed(() => session.me.value?.mustChangePassword ?? false)

async function onChanged() {
  const me = await session.load()
  if (me) await navigateTo(safeRedirect(route.query.redirect) ?? homePath(me))
}
</script>

<template>
  <div class="space-y-5">
    <div class="space-y-1">
      <h1 class="text-xl font-semibold">
        {{ t('account.changePassword.title') }}
      </h1>
      <p
        v-if="forced"
        class="text-sm text-muted"
      >
        {{ t('account.changePassword.forced') }}
      </p>
    </div>
    <ChangePasswordForm @changed="onChanged" />
    <SignOutButton />
  </div>
</template>
