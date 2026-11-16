<script setup lang="ts">
/** The shop's home (spec §4 → Today). Its counts and lists arrive with orders (M2.3). */
const { t } = useI18n()
const { me } = useSession()
</script>

<template>
  <UDashboardPanel id="today">
    <template #header>
      <UDashboardNavbar :title="t('today.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="space-y-1">
        <h2 class="text-lg font-semibold break-words">
          {{ t('today.welcome', { shop: me?.shop?.name }) }}
        </h2>
        <p class="text-sm text-muted">
          {{ t('today.soon') }}
        </p>
      </div>
    </template>
  </UDashboardPanel>
</template>
