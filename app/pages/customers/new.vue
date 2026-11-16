<script setup lang="ts">
import CustomerPage from '~/features/customers/components/CustomerPage.vue'

definePageMeta({ layout: 'shop', area: 'shop', permission: 'customer:write', title: 'customers.new' })
</script>

<template>
  <CustomerPage />
</template>
