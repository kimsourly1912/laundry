<script setup lang="ts">
import CustomerPage from '~/features/customers/components/CustomerPage.vue'
import { CustomerOrders } from '~/features/orders'

const { can } = useSession()

definePageMeta({ layout: 'shop', area: 'shop', permission: 'customer:read', title: 'customers.title' })
</script>

<template>
  <CustomerPage :id="String($route.params.id)">
    <template #after>
      <CustomerOrders
        v-if="can('order:read')"
        :customer-id="String($route.params.id)"
      />
    </template>
  </CustomerPage>
</template>
