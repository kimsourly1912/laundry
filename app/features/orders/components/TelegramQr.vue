<script setup lang="ts">
/**
 * The QR the counter shows so the customer gets the order on Telegram (D28): their phone's camera
 * opens the shop's bot, which asks for their phone and sends the receipt, then a message when the
 * order is ready. Each one is new and valid a day.
 */
import { encode } from 'uqr'
import type { TelegramInvite } from '#shared/contracts/telegram'

/** `hideWhenOff`: show nothing while the bot isn't set up (the saved screen), instead of saying so. */
const props = defineProps<{ orderId: string, hideWhenOff?: boolean }>()
const { t, te } = useI18n()

// Not under `orders:`: an order's changes refresh those, and each refresh would make a new QR.
const invite = useApiQuery(() => `telegram:invite:${props.orderId}`, () => apiFetch<TelegramInvite>(`/shop/orders/${props.orderId}/telegram-invite`, { method: 'POST', body: {} }))
const off = computed(() => invite.error.value?.code === 'TELEGRAM_OFF')

/** The code as one path of 1×1 squares, with a quiet zone of 2 around it. */
const qr = computed(() => {
  const url = invite.data.value?.url
  if (!url) return undefined
  const { size, data } = encode(url, { ecc: 'M', border: 2 })
  const path = data.flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${x} ${y}h1v1h-1z`] : []))).join('')
  return { size, path }
})
</script>

<template>
  <p
    v-if="off && !hideWhenOff"
    class="text-sm text-muted"
  >
    {{ t('orders.telegram.off') }}
  </p>
  <section
    v-else-if="!off"
    class="space-y-3 rounded-lg border border-default p-4 text-center"
    :aria-label="t('orders.telegram.title')"
  >
    <h2 class="font-medium">
      {{ t('orders.telegram.title') }}
    </h2>
    <p class="text-sm text-muted">
      {{ t('orders.telegram.help') }}
    </p>
    <div
      v-if="qr"
      class="mx-auto w-56 max-w-full rounded-md bg-white p-1"
    >
      <svg
        :viewBox="`0 0 ${qr.size} ${qr.size}`"
        class="block h-auto w-full"
        shape-rendering="crispEdges"
        role="img"
        :aria-label="t('orders.telegram.qr')"
      >
        <path
          :d="qr.path"
          fill="#000"
        />
      </svg>
    </div>
    <USkeleton
      v-else-if="invite.pending.value"
      class="mx-auto size-56"
    />
    <div
      v-else-if="invite.error.value"
      class="space-y-2"
    >
      <p class="text-sm text-error">
        {{ errorText(invite.error.value, t, te) }}
      </p>
      <UButton
        :label="t('common.actions.retry')"
        color="neutral"
        variant="outline"
        @click="invite.refresh()"
      />
    </div>
  </section>
</template>
