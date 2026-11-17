<script setup lang="ts">
import { en } from '@nuxt/ui/locale'

/** English only (D36): `<html lang="en">` and Nuxt UI's own texts in English. */
const { t } = useI18n()
const route = useRoute()
const head = useLocaleHead({ lang: true, dir: true, seo: false })
useHead(() => ({
  htmlAttrs: { lang: head.value.htmlAttrs?.lang, dir: head.value.htmlAttrs?.dir },
  title: route.meta.title ? `${t(route.meta.title)} · ${t('app.name')}` : t('app.name'),
}))
</script>

<template>
  <UApp :locale="en">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
