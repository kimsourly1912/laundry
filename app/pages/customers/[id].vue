<script setup lang="ts">
import CustomerPage from '~/features/customers/components/CustomerPage.vue'

definePageMeta({ layout: 'shop', area: 'shop', permission: 'customer:read', title: 'customers.title' })
</script>

<template>
  <CustomerPage :id="String($route.params.id)" />
</template>
