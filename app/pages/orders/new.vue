<script setup lang="ts">
definePageMeta({ layout: 'shop', area: 'shop', permission: 'order:create', title: 'orders.new.title' })

await navigateTo({ path: '/', query: useRoute().query }, { replace: true })
</script>
