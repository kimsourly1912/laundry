<script setup lang="ts">
/**
 * The shop's home (spec §4 → Today; page-patterns → Dashboard): counts, then what needs the owner
 * now: orders ready and not collected, and unpaid ones. "Today" starts at midnight in Phnom Penh.
 */
import type { TodayOverview } from '#shared/contracts/orders'
import { OrderRows } from '~/features/orders'

const { t } = useI18n()
const { me, can } = useSession()
const NuxtLink = resolveComponent('NuxtLink')
const today = useApiQuery('orders:today', () => apiFetch<TodayOverview>('/shop/today'))

const tiles = computed(() => {
  const counts = today.data.value?.counts
  if (!counts) return []
  return [
    { key: 'received', value: counts.received, to: '/orders?status=received' },
    { key: 'inProgress', value: counts.inProgress, to: '/orders?status=in_progress' },
    { key: 'ready', value: counts.ready, to: '/orders?status=ready' },
    { key: 'unpaid', value: counts.unpaid, to: '/orders?payment=unpaid' },
    { key: 'createdToday', value: counts.createdToday, to: undefined },
    { key: 'collectedToday', value: counts.collectedToday, to: undefined },
  ]
})
</script>

<template>
  <UDashboardPanel id="today">
    <template #header>
      <UDashboardNavbar :title="t('today.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            v-if="can('order:create')"
            :label="t('orders.new')"
            icon="i-lucide-plus"
            to="/orders/new"
          />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="space-y-6">
        <h2 class="text-lg font-semibold break-words">
          {{ me?.shop?.name }}
        </h2>
        <PageLoadError
          v-if="today.error.value && !today.data.value"
          :error="today.error.value"
          @retry="today.refresh()"
        />
        <div
          v-else-if="!today.data.value"
          class="grid grid-cols-2 gap-3 sm:grid-cols-3"
        >
          <USkeleton
            v-for="n in 6"
            :key="n"
            class="h-20"
          />
        </div>
        <template v-else>
          <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <li
              v-for="tile in tiles"
              :key="tile.key"
            >
              <component
                :is="tile.to ? NuxtLink : 'div'"
                :to="tile.to"
                class="block rounded-md border border-default px-4 py-3"
                :class="{ 'hover:bg-elevated/50 focus-visible:outline-2 focus-visible:outline-primary': tile.to }"
              >
                <span class="block text-2xl font-semibold tabular-nums">{{ tile.value }}</span>
                <span class="block text-sm text-muted">{{ t(`today.counts.${tile.key}`) }}</span>
              </component>
            </li>
          </ul>

          <section class="space-y-2">
            <h3 class="font-semibold">
              {{ t('today.readyTitle') }}
            </h3>
            <OrderRows
              v-if="today.data.value.ready.length"
              :orders="today.data.value.ready"
            />
            <p
              v-else
              class="text-sm text-muted"
            >
              {{ t('today.readyEmpty') }}
            </p>
          </section>

          <section class="space-y-2">
            <h3 class="font-semibold">
              {{ t('today.unpaidTitle') }}
            </h3>
            <OrderRows
              v-if="today.data.value.unpaid.length"
              :orders="today.data.value.unpaid"
            />
            <p
              v-else
              class="text-sm text-muted"
            >
              {{ t('today.unpaidEmpty') }}
            </p>
          </section>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
