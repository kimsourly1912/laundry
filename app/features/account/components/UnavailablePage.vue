<script setup lang="ts">
/** An owner whose shop is suspended, or an account without a shop (spec §5): why, and sign out. */
const { t } = useI18n()
const { me } = useSession()
const suspended = computed(() => me.value?.shop?.status === 'suspended')
</script>

<template>
  <div class="space-y-5">
    <div class="space-y-2">
      <UIcon
        :name="suspended ? 'i-lucide-pause-circle' : 'i-lucide-store'"
        class="size-8 text-warning"
      />
      <h1 class="text-xl font-semibold">
        {{ suspended ? t('account.unavailable.suspendedTitle') : t('account.unavailable.noShopTitle') }}
      </h1>
      <p class="text-sm text-muted">
        {{ suspended ? t('account.unavailable.suspended', { shop: me?.shop?.name }) : t('account.unavailable.noShop') }}
      </p>
    </div>
    <SignOutButton />
  </div>
</template>
