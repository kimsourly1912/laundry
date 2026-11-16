<script setup lang="ts">
import ReceiptDesignerPage from '~/features/receipts/components/ReceiptDesignerPage.vue'

definePageMeta({ layout: 'platform', area: 'platform', permission: 'receipt:read', title: 'receipts.title' })
const shopId = String(useRoute().params.id)
</script>

<template>
  <ReceiptDesignerPage :shop-id="shopId" />
</template>
