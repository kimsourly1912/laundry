<script setup lang="ts">
import type { OrderDetail } from '#shared/contracts/orders'
import ServerSlip from './ServerSlip.vue'
import TelegramCard from './TelegramCard.vue'

const props = defineProps<{ orderId: string }>()
const { t } = useI18n()
const { can } = useSession()
const order = useApiQuery(() => `orders:order:${props.orderId}`, () => apiFetch<OrderDetail>(`/shop/orders/${props.orderId}`))
</script>

<template>
  <UDashboardPanel id="saved-slip">
    <template #header>
      <UDashboardNavbar
        :toggle="false"
        :title="t('orders.order.loadingTitle')"
      >
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            to="/orders"
            :aria-label="t('orders.list.title')"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-page space-y-4">
        <UEmpty
          v-if="order.error.value?.kind === 'not_found'"
          icon="i-lucide-search-x"
          :title="t('orders.order.notFound')"
          :actions="[{ label: t('orders.list.title'), to: '/orders' }]"
        />
        <PageLoadError
          v-else-if="order.error.value"
          :error="order.error.value"
          @retry="order.refresh()"
        />
        <USkeleton
          v-else-if="!order.data.value"
          class="aspect-[10/7] w-full"
        />
        <template v-else>
          <div class="flex items-baseline justify-between gap-3">
            <h1
              class="text-lg font-semibold text-highlighted"
              data-testid="slip-number"
            >
              {{ t('orders.order.title', { number: order.data.value.number }) }}
            </h1>
            <p class="text-sm text-muted">
              {{ formatDate(order.data.value.date) }}
            </p>
          </div>
          <div class="rounded-sm bg-white shadow-sm ring-1 ring-default">
            <ServerSlip
              :path="`/shop/orders/${orderId}/slip`"
              :width="order.data.value.design.width"
              :height="order.data.value.design.height"
            />
          </div>
          <TelegramCard
            v-if="can('order:share') && order.data.value.status !== 'cancelled'"
            :order-id="orderId"
          />
          <BottomBarSpacer v-if="can('order:create')" />
          <BottomBar v-if="can('order:create')">
            <UButton
              :label="t('orders.order.nextSlip')"
              icon="i-lucide-plus"
              to="/"
              block
              data-testid="next-slip"
            />
          </BottomBar>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
