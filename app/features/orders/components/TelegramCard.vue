<script setup lang="ts">
import { encode } from 'uqr'
import type { OrderTelegram } from '#shared/contracts/telegram'

const props = defineProps<{ orderId: string }>()
const { t } = useI18n()
const telegram = useMutation(() => apiFetch<OrderTelegram>(`/shop/orders/${props.orderId}/telegram`, { method: 'POST' }), { inline: true })
const url = ref<string>()

async function load() {
  const result = await telegram.execute(undefined)
  if (result.ok) url.value = result.data.url
}

onMounted(load)

const qr = computed(() => {
  if (!url.value) return undefined
  const { data, size } = encode(url.value, { ecc: 'M', border: 4 })
  const path = data.flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${x} ${y}h1v1h-1z`] : []))).join('')
  return { path, size }
})
</script>

<template>
  <section
    class="space-y-3 rounded-lg border border-default bg-default p-4"
    aria-labelledby="telegram-title"
    data-testid="telegram-card"
  >
    <div class="space-y-1">
      <h2
        id="telegram-title"
        class="font-semibold text-highlighted"
      >
        {{ t('orders.telegram.title') }}
      </h2>
      <p class="text-sm text-muted">
        {{ t('orders.telegram.hint') }}
      </p>
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
      class="flex flex-col items-center gap-2"
    >
      <svg
        :viewBox="`0 0 ${qr.size} ${qr.size}`"
        class="size-48 max-w-full bg-white"
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
      <UButton
        :label="t('orders.telegram.refresh')"
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="ghost"
        :loading="telegram.pending.value"
        @click="load"
      />
    </div>
  </section>
</template>
