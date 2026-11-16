<script setup lang="ts">
/** The app's language (docs/standards/i18n.md → Locales): kept in a cookie, no reload. */
const { locale, locales, setLocale, t } = useI18n()
const items = computed(() => locales.value.map(item => ({ label: item.name ?? item.code, value: item.code })))
</script>

<template>
  <USelect
    :model-value="locale"
    :items="items"
    :aria-label="t('common.language')"
    icon="i-lucide-languages"
    class="w-36"
    @update:model-value="value => setLocale(value as typeof locale)"
  />
</template>
