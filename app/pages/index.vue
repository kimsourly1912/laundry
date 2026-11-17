<script setup lang="ts">
/**
 * The shop's Overview. Until the owner portal (plan step 3) brings today's orders and Create order,
 * it says what's coming; the settings and account are under More.
 */
definePageMeta({ layout: 'shop', area: 'shop', permission: 'shop:read', title: 'overview.title' })

const { t } = useI18n()
const { me } = useSession()
</script>

<template>
  <UDashboardPanel id="overview">
    <template #header>
      <!-- The shop's home: its name on top, so the owner sees which shop this is. -->
      <UDashboardNavbar :title="me?.shop?.name ?? t('overview.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-page">
        <UEmpty
          icon="i-lucide-receipt-text"
          :title="t('overview.comingTitle')"
          :description="t('overview.comingDescription')"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
