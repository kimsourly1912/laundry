<script setup lang="ts">
import { customersNavigation } from '~/features/customers'
import { ordersNavigation } from '~/features/orders'
import { pricingNavigation } from '~/features/pricing'
import { shopSettingsNavigation } from '~/features/shop-settings'
import { todayNavigation } from '~/features/today'

// Each shop feature's navigation.ts, in the order of the sidebar (responsive-layout → Navigation).
const links = [...todayNavigation, ...ordersNavigation, ...customersNavigation, ...pricingNavigation, ...shopSettingsNavigation]
</script>

<template>
  <AppShell
    :links="links"
    home="/"
  >
    <slot />
  </AppShell>
</template>
