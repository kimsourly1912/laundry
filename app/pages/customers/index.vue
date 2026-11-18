<script setup lang="ts">
import { CustomersPage } from '~/features/customers'

definePageMeta({ layout: 'shop', area: 'shop', permission: 'customer:read', title: 'customers.title' })
</script>

<template>
  <CustomersPage />
</template>
