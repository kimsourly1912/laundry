<script setup lang="ts">
/**
 * The order's Telegram QR (plan §3 steps 5–6, step 4; implementation guide → sheet 02): the customer
 * scans it with the phone's camera, taps Start in the bot, and gets this slip as a picture. A new QR
 * each time the card opens (valid a day). Below it, what the order's chats were sent. Hidden when
 * the deployment has no bot, for a cancelled order, and without `order:share`.
 */
import { encode } from 'uqr'
import type { OrderTelegram } from '#shared/contracts/telegram'

const props = defineProps<{ orderId: string, cancelled: boolean }>()

const { t } = useI18n()
const { can } = useSession()

const telegram = useMutation(() => apiFetch<OrderTelegram>(`/shop/orders/${props.orderId}/telegram`, { method: 'POST' }), { inline: true })
const answer = shallowRef<OrderTelegram>()
async function load() {
  const result = await telegram.execute(undefined)
  if (result.ok) answer.value = result.data
}
const shown = computed(() => can('order:share') && !props.cancelled && telegram.error.value?.code !== 'TELEGRAM_NOT_SET_UP')
onMounted(() => {
  if (shown.value) void load()
})

/** The QR's dark modules as one SVG path: one `M x y h1 v1 h-1 z` per module, a 4-module quiet zone. */
const qr = computed(() => {
  if (!answer.value) return undefined
  const { data, size } = encode(answer.value.url, { ecc: 'M', border: 4 })
  const path = data.flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${x} ${y}h1v1h-1z`] : []))).join('')
  return { path, size }
})

const STATUS_KEYS = { pending: 'orders.telegram.pending', sent: 'orders.telegram.sent', skipped: 'orders.telegram.skipped', failed: 'orders.telegram.failed' } as const
const STATUS_COLORS = { pending: 'neutral', sent: 'success', skipped: 'warning', failed: 'error' } as const
</script>

<template>
  <section
    v-if="shown"
    class="space-y-3 rounded-md border border-default p-4 print:hidden"
    aria-labelledby="telegram-title"
    data-testid="telegram-card"
  >
    <div class="flex items-center gap-2">
      <UIcon
        name="i-lucide-send"
        class="size-5 text-primary"
      />
      <h2
        id="telegram-title"
        class="font-semibold text-highlighted"
      >
        {{ t('orders.telegram.title') }}
      </h2>
    </div>
    <PageLoadError
      v-if="telegram.error.value"
      :error="telegram.error.value"
      @retry="load"
    />
    <USkeleton
      v-else-if="!qr"
      class="mx-auto size-48"
    />
    <div
      v-else
      class="flex flex-col items-center gap-2 sm:flex-row sm:items-start sm:gap-4"
    >
      <svg
        :viewBox="`0 0 ${qr.size} ${qr.size}`"
        class="size-48 shrink-0 bg-white"
        shape-rendering="crispEdges"
        role="img"
        :aria-label="t('orders.telegram.qrLabel')"
        data-testid="telegram-qr"
      >
        <path
          :d="qr.path"
          fill="#000"
        />
      </svg>
      <div class="space-y-2 text-sm">
        <p>{{ t('orders.telegram.hint') }}</p>
        <ul
          v-if="answer?.messages.length"
          class="space-y-1"
          data-testid="telegram-messages"
        >
          <li
            v-for="(message, index) in answer.messages"
            :key="index"
            class="flex items-center gap-2"
          >
            <UBadge
              :label="t(STATUS_KEYS[message.status])"
              :color="STATUS_COLORS[message.status]"
              variant="subtle"
            />
            <span class="text-muted">{{ formatDateTime(message.sentAt ?? message.createdAt) }}</span>
          </li>
        </ul>
        <UButton
          :label="t('orders.telegram.refresh')"
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          size="sm"
          :loading="telegram.pending.value"
          @click="load"
        />
      </div>
    </div>
  </section>
</template>
