<script setup lang="ts">
import { CustomerPage } from '~/features/customers'
import { CustomerOrders } from '~/features/orders'

definePageMeta({ layout: 'shop', area: 'shop', permission: 'customer:read', title: 'customers.title' })

const route = useRoute()
const customerId = computed(() => String(route.params.id))
</script>

<template>
  <CustomerPage
    :key="customerId"
    :customer-id="customerId"
  >
    <CustomerOrders :customer-id="customerId" />
  </CustomerPage>
</template>
