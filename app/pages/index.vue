<script setup lang="ts">
/**
 * The shop's Overview (plan §3; implementation guide → sheet 01): New order in one tap, then the
 * latest orders. Counts by state come with the order lifecycle (sheets 03, 04).
 */
import { LatestOrders } from '~/features/orders'

definePageMeta({ layout: 'shop', area: 'shop', permission: 'shop:read', title: 'overview.title' })

const { t } = useI18n()
const { me, can } = useSession()
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
      <div class="mx-auto w-full max-w-page space-y-6">
        <UButton
          v-if="can('order:create')"
          :label="t('orders.new.title')"
          icon="i-lucide-plus"
          size="xl"
          block
          to="/orders/new"
          data-testid="new-order"
        />
        <LatestOrders v-if="can('order:read')" />
      </div>
    </template>
  </UDashboardPanel>
</template>
