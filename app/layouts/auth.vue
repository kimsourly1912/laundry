<script setup lang="ts">
/** Sign-in, change password and the "unavailable" notice: one centered card, the language choice. */
const { t } = useI18n()
</script>

<template>
  <div class="flex min-h-dvh flex-col items-center justify-center gap-6 bg-muted px-4 py-10">
    <div class="flex items-center gap-2 text-lg font-semibold">
      <UIcon
        name="i-lucide-shirt"
        class="size-6 text-primary"
      />
      {{ t('app.name') }}
    </div>
    <UCard class="w-full max-w-sm">
      <slot />
    </UCard>
    <LanguageSelect />
  </div>
</template>
