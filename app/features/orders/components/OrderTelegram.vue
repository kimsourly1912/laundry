<script setup lang="ts">
/**
 * Whether the order's customer gets it on Telegram, and what was sent (D28): so the owner knows
 * without asking. Not linked: a button for the QR.
 */
import type { OrderTelegramStatus } from '#shared/contracts/telegram'

const props = defineProps<{ orderId: string }>()
defineEmits<{ showQr: [] }>()
const { t, locale } = useI18n()

// Under `orders:`: an order's change (ready, collected) refreshes it with the order.
const status = useApiQuery(() => `orders:telegram:${props.orderId}`, () => apiFetch<OrderTelegramStatus>(`/shop/orders/${props.orderId}/telegram`))
const color = (state: OrderTelegramStatus['messages'][number]['status']) => ({ sent: 'success', pending: 'neutral', skipped: 'neutral', failed: 'error' } as const)[state]
</script>

<template>
  <section
    v-if="status.data.value"
    class="space-y-2"
  >
    <h2 class="text-sm font-semibold">
      {{ t('orders.telegram.statusTitle') }}
    </h2>
    <div
      v-if="!status.data.value.chats"
      class="flex flex-wrap items-center justify-between gap-2 text-sm"
    >
      <span class="text-muted">{{ t('orders.telegram.notLinked') }}</span>
      <UButton
        :label="t('orders.telegram.open')"
        icon="i-lucide-qr-code"
        color="neutral"
        variant="outline"
        size="sm"
        @click="$emit('showQr')"
      />
    </div>
    <p
      v-else
      class="text-sm"
    >
      {{ t('orders.telegram.linked', { count: status.data.value.chats }, status.data.value.chats) }}
    </p>
    <ol
      v-if="status.data.value.messages.length"
      class="space-y-1 text-sm"
    >
      <li
        v-for="(message, index) in status.data.value.messages"
        :key="index"
        class="flex items-center justify-between gap-2"
      >
        <span>{{ t(`orders.telegram.kind.${message.kind}`) }}</span>
        <span class="flex items-center gap-2">
          <span class="text-muted tabular-nums">{{ formatDateTime(message.sentAt ?? message.createdAt, locale) }}</span>
          <UBadge
            :label="t(`orders.telegram.state.${message.status}`)"
            :color="color(message.status)"
            variant="subtle"
          />
        </span>
      </li>
    </ol>
  </section>
</template>
