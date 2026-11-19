<script setup lang="ts">
/** A load error in place of the content: a safe message and Retry (page-patterns → States). */
const props = defineProps<{ error: unknown, loading?: boolean }>()
defineEmits<{ retry: [] }>()
const { t, te } = useI18n()
const message = computed(() => errorText(props.error, t, te))
</script>

<template>
  <UAlert
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :title="message"
    :actions="[{ label: t('common.actions.retry'), color: 'neutral', variant: 'outline', loading, onClick: () => $emit('retry') }]"
  />
</template>
