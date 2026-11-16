<script setup lang="ts">
import * as locales from '@nuxt/ui/locale'

/** `<html lang>` and Nuxt UI's own texts follow the chosen language (docs/standards/i18n.md). */
const { locale, t } = useI18n()
const route = useRoute()
const head = useLocaleHead({ lang: true, dir: true, seo: false })
useHead(() => ({
  htmlAttrs: { lang: head.value.htmlAttrs?.lang, dir: head.value.htmlAttrs?.dir },
  title: route.meta.title ? `${t(route.meta.title)} · ${t('app.name')}` : t('app.name'),
}))
const uiLocale = computed(() => locales[locale.value as keyof typeof locales] ?? locales.en)
</script>

<template>
  <UApp :locale="uiLocale">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
