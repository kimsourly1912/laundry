<script setup lang="ts">
/**
 * Prices (D43): one row per priced item on the shop's slips, where the owner types how much it costs.
 * The slips decide the items; their names and per piece or per kg come from the item list. Items
 * still missing a price are flagged, since staff can't fill them on a new order. Prices kept only
 * for old orders are listed below.
 */
import type { PriceList } from '#shared/contracts/prices'
import { missingPrices } from '#shared/contracts/prices'
import PriceRow from './PriceRow.vue'

const { t } = useI18n()
const { can } = useSession()
const prices = useApiQuery('prices:list', () => apiFetch<PriceList>('/shop/prices'))
const onSlips = computed(() => (prices.data.value?.items ?? []).filter(item => item.onSlip))
const kept = computed(() => (prices.data.value?.items ?? []).filter(item => !item.onSlip))
const missing = computed(() => (prices.data.value ? missingPrices(prices.data.value).length : 0))
</script>

<template>
  <UDashboardPanel id="prices">
    <template #header>
      <UDashboardNavbar :title="t('prices.title')">
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            to="/more"
            :aria-label="t('common.actions.back')"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-page space-y-4">
        <p class="text-sm text-muted">
          {{ t('prices.intro') }}
        </p>
        <PageLoadError
          v-if="prices.error.value && !prices.data.value"
          :error="prices.error.value"
          @retry="prices.refresh()"
        />
        <USkeleton
          v-else-if="!prices.data.value"
          class="h-32 w-full"
        />
        <UEmpty
          v-else-if="!prices.data.value.items.length"
          icon="i-lucide-tags"
          :title="t('prices.emptyTitle')"
          :description="t('prices.emptyDescription')"
        />
        <template v-else>
          <UAlert
            v-if="missing"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :title="t('prices.missing', { count: missing }, missing)"
            :description="t('prices.missingHint')"
            data-testid="prices-missing"
          />
          <ul
            v-if="onSlips.length"
            class="divide-y divide-default rounded-md border border-default"
            data-testid="prices-active"
          >
            <PriceRow
              v-for="item in onSlips"
              :key="item.key"
              :item="item"
              :currency="prices.data.value.currency"
              :can-write="can('price:write')"
              @saved="prices.refresh()"
            />
          </ul>
          <ul
            v-if="kept.length"
            class="divide-y divide-default rounded-md border border-default"
            data-testid="prices-kept"
          >
            <li class="bg-elevated/50 px-4 py-2">
              <p class="text-sm font-medium text-muted">
                {{ t('prices.kept') }}
              </p>
              <p class="text-xs text-dimmed">
                {{ t('prices.keptHint') }}
              </p>
            </li>
            <PriceRow
              v-for="item in kept"
              :key="item.key"
              :item="item"
              :currency="prices.data.value.currency"
              :can-write="false"
            />
          </ul>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
