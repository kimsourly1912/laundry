<script setup lang="ts">
import CustomerListPage from '~/features/customers/components/CustomerListPage.vue'

definePageMeta({ layout: 'shop', area: 'shop', permission: 'customer:read', title: 'customers.title' })
</script>

<template>
  <CustomerListPage />
</template>
