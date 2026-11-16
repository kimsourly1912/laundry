<script setup lang="ts">
import AccountPage from '~/features/account/components/AccountPage.vue'

// Any session's page, in its own shell: the platform's or the shop's.
definePageMeta({ layout: false, title: 'account.page.title' })
const { me } = useSession()
const layout = computed(() => (me.value?.platformRole ? 'platform' : me.value?.shop?.status === 'active' ? 'shop' : 'auth'))
</script>

<template>
  <NuxtLayout :name="layout">
    <AccountPage />
  </NuxtLayout>
</template>
