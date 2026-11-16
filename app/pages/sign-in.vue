<script setup lang="ts">
import SignInPage from '~/features/account/components/SignInPage.vue'

definePageMeta({ layout: 'auth', public: true, title: 'account.signIn.title' })
</script>

<template>
  <SignInPage />
</template>
