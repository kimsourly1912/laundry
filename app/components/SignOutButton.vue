<script setup lang="ts">
import { useSignOut } from '~/features/account'

const { t } = useI18n()
const { signOut, pending } = useSignOut()
</script>

<template>
  <UButton
    :label="t('common.actions.signOut')"
    icon="i-lucide-log-out"
    color="neutral"
    variant="ghost"
    :loading="pending"
    block
    @click="signOut()"
  />
</template>
