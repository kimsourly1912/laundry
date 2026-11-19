<script setup lang="ts">
/**
 * Overview's reminder (D43): items on the shop's slips with no price yet, which staff can't fill on
 * a new order. The owner gets a link to Prices; staff are told who sets them.
 */
import type { PriceList } from '#shared/contracts/prices'
import { missingPrices } from '#shared/contracts/prices'

const { t } = useI18n()
const { can } = useSession()
const prices = useApiQuery('prices:list', () => apiFetch<PriceList>('/shop/prices'))
const missing = computed(() => (prices.data.value ? missingPrices(prices.data.value) : []))
</script>

<template>
  <UAlert
    v-if="missing.length"
    color="warning"
    variant="subtle"
    icon="i-lucide-triangle-alert"
    :title="t('prices.missing', { count: missing.length }, missing.length)"
    :description="can('price:write') ? t('prices.missingOwner', { items: missing.map(item => item.label).join(', ') }) : t('prices.missingStaff')"
    :actions="can('price:write') ? [{ label: t('prices.setPrices'), color: 'warning', variant: 'outline', to: '/prices' }] : []"
    data-testid="overview-missing-prices"
  />
</template>
