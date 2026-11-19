<script setup lang="ts">
/**
 * One order (plan §3 steps 5 and 7; implementation guide → sheet 02): the saved slip, drawn from
 * the template version the order was made on and the copy of the shop's details it keeps, so a
 * reprint is the slip the customer was given, with its number. Right after saving (`?saved=1`) it
 * says so with the number in big digits for the bag, and Next order; with `?print=1` it opens the
 * print dialog once. Print again never saves anything.
 */
import type { OrderDetail } from '#shared/contracts/orders'
import { formatPhone } from '#shared/contracts/phone'
import { useSlipPrint, useSlipText } from '~/features/slip-fill'
import { ORDER_STATE_BADGE, orderState } from '../utils/order-status'
import OrderActions from './OrderActions.vue'
import TelegramCard from './TelegramCard.vue'
import SlipView from './SlipView.vue'

const props = defineProps<{ orderId: string }>()

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { can } = useSession()

const order = useApiQuery(() => `orders:order:${props.orderId}`, () => apiFetch<OrderDetail>(`/shop/orders/${props.orderId}`))
const slipText = useSlipText()

const justSaved = computed(() => route.query.saved === '1')
const imageHref = (imageId: string) => `/api/shop/orders/${props.orderId}/images/${imageId}`
const data = computed(() => {
  const value = order.data.value
  return value && {
    values: value.values,
    order: { number: value.number, date: value.date, phone: value.phone, amount: value.amount, paid: value.paid },
    shop: value.shop,
  }
})

const badge = computed(() => order.data.value && ORDER_STATE_BADGE[orderState(order.data.value)])

// D39: a reprint uses the paper size pinned to the order's template version.
const printSlip = useSlipPrint(() => order.data.value?.design.paper)

/** D39: the order's Telegram link, once the QR card has made it: an HTML slip draws it as its QR. */
const qrUrl = ref<string>()

/** An action's answer is the order as it is now: show it at once. */
function changed(next: OrderDetail) {
  order.data.value = next
}

const printing = ref(false)
async function print() {
  printing.value = true
  try {
    await nextTick()
    await printSlip()
  }
  finally {
    printing.value = false
  }
}

// Save & print: print once the saved slip is on screen, then forget the request so a reload doesn't print again.
const printRequested = ref(route.query.print === '1')
watch([() => order.data.value, () => slipText.text.value], async ([value, text]) => {
  if (!printRequested.value || !value || !text) return
  printRequested.value = false
  await router.replace({ query: { ...route.query, print: undefined } })
  await print()
}, { immediate: true })
</script>

<template>
  <UDashboardPanel id="order">
    <template #header>
      <UDashboardNavbar :title="order.data.value ? t('orders.order.title', { number: order.data.value.number }) : t('orders.order.loadingTitle')">
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            to="/"
            :aria-label="t('common.actions.back')"
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
          :actions="[{ label: t('orders.order.toOverview'), to: '/' }]"
          data-testid="order-not-found"
        />
        <PageLoadError
          v-else-if="(order.error.value && !order.data.value) || slipText.failed.value"
          :error="order.error.value ?? new Error('fonts')"
          @retry="order.error.value ? order.refresh() : slipText.reload()"
        />
        <div
          v-else-if="!order.data.value || !data || !slipText.text.value"
          class="space-y-3"
        >
          <USkeleton class="h-20 w-full" />
          <USkeleton class="aspect-[3/2] w-full" />
        </div>

        <template v-else>
          <div
            v-if="justSaved"
            class="flex items-start gap-3 print:hidden"
            data-testid="order-saved"
          >
            <UIcon
              name="i-lucide-circle-check"
              class="mt-1 size-8 shrink-0 text-success"
            />
            <div class="min-w-0">
              <h2 class="text-xl font-semibold text-highlighted">
                {{ t('orders.order.saved') }}
              </h2>
              <p class="text-muted">
                {{ t('orders.order.savedHint') }}
              </p>
            </div>
          </div>

          <div class="flex flex-wrap items-end justify-between gap-3 print:hidden">
            <div>
              <p class="text-sm text-muted">
                {{ t('orders.order.number') }}
              </p>
              <p
                class="text-5xl font-bold tracking-tight text-highlighted tabular-nums"
                data-testid="order-number"
              >
                {{ order.data.value.number }}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <UBadge
                :label="t(badge!.key)"
                :color="badge!.color"
                variant="subtle"
                size="lg"
                data-testid="order-status"
              />
              <UBadge
                :label="order.data.value.paid ? t('orders.paid') : t('orders.unpaid')"
                :color="order.data.value.paid ? 'success' : 'warning'"
                variant="subtle"
                size="lg"
                data-testid="order-paid"
              />
            </div>
          </div>

          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm print:hidden">
            <dt class="text-muted">
              {{ t('orders.order.date') }}
            </dt>
            <dd>{{ formatDate(order.data.value.date) }}</dd>
            <template v-if="order.data.value.amount !== null">
              <dt class="text-muted">
                {{ t('orders.order.amount') }}
              </dt>
              <dd class="tabular-nums">
                {{ formatMoney(order.data.value.amount, order.data.value.currency) }}
              </dd>
            </template>
            <template v-if="order.data.value.phone">
              <dt class="text-muted">
                {{ t('orders.order.phone') }}
              </dt>
              <dd>{{ formatPhone(order.data.value.phone) }}</dd>
            </template>
            <dt class="text-muted">
              {{ t('orders.order.slip') }}
            </dt>
            <dd
              class="min-w-0 break-words"
              data-testid="order-version"
            >
              {{ t('orders.order.slipVersion', { name: order.data.value.templateName, version: order.data.value.templateVersionNumber }) }}
            </dd>
            <template v-if="order.data.value.paidAt">
              <dt class="text-muted">
                {{ t('orders.order.paidAt') }}
              </dt>
              <dd>{{ formatDateTime(order.data.value.paidAt) }}</dd>
            </template>
            <template v-if="order.data.value.dueDate">
              <dt class="text-muted">
                {{ t('orders.order.dueDate') }}
              </dt>
              <dd data-testid="order-due-date">
                {{ formatDate(order.data.value.dueDate) }}
              </dd>
            </template>
            <template v-if="order.data.value.customerName">
              <dt class="text-muted">
                {{ t('orders.order.customer') }}
              </dt>
              <dd class="min-w-0 break-words">
                <ULink
                  v-if="order.data.value.customerId"
                  :to="`/customers/${order.data.value.customerId}`"
                  class="text-primary"
                >
                  {{ order.data.value.customerName }}
                </ULink>
              </dd>
            </template>
            <template v-if="order.data.value.readyAt">
              <dt class="text-muted">
                {{ t('orders.order.readyAt') }}
              </dt>
              <dd>{{ formatDateTime(order.data.value.readyAt) }}</dd>
            </template>
            <template v-if="order.data.value.pickedUpAt">
              <dt class="text-muted">
                {{ t('orders.order.pickedUpAt') }}
              </dt>
              <dd data-testid="order-picked-up-at">
                {{ formatDateTime(order.data.value.pickedUpAt) }}
              </dd>
            </template>
            <template v-if="order.data.value.cancelledAt">
              <dt class="text-muted">
                {{ t('orders.order.cancelledAt') }}
              </dt>
              <dd>{{ formatDateTime(order.data.value.cancelledAt) }}</dd>
            </template>
          </dl>

          <table
            v-if="order.data.value.items.length"
            class="w-full text-sm print:hidden"
            data-testid="order-items"
          >
            <thead class="text-left text-muted">
              <tr>
                <th class="py-1 font-normal">
                  {{ t('orders.order.item') }}
                </th>
                <th class="py-1 text-right font-normal">
                  {{ t('orders.order.quantity') }}
                </th>
                <th class="py-1 text-right font-normal">
                  {{ t('orders.order.lineTotal') }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default border-y border-default">
              <tr
                v-for="item in order.data.value.items"
                :key="item.fieldId"
              >
                <td class="py-1.5 break-words">
                  {{ item.label }}
                  <span class="block text-xs text-muted">{{ t(item.unit === 'kg' ? 'orders.form.perKg' : 'orders.form.each', { price: formatMoney(item.unitPrice, order.data.value.currency) }) }}</span>
                </td>
                <td class="py-1.5 text-right tabular-nums">
                  {{ item.unit === 'kg' ? t('orders.order.kg', { kg: (item.quantity / 1000).toFixed(2) }) : item.quantity }}
                </td>
                <td class="py-1.5 text-right tabular-nums">
                  {{ formatMoney(item.lineTotal, order.data.value.currency) }}
                </td>
              </tr>
            </tbody>
          </table>

          <OrderActions
            :order="order.data.value"
            @changed="changed"
            @reload="order.refresh()"
          />

          <TelegramCard
            :order-id="order.data.value.id"
            :cancelled="order.data.value.status === 'cancelled'"
            @link="url => qrUrl = url"
          />

          <SlipView
            :design="order.data.value.design"
            :data="data"
            :text="slipText.text.value"
            :image-href="imageHref"
            :server="{ path: `/shop/orders/${orderId}/slip${qrUrl ? `?qr=${encodeURIComponent(qrUrl)}` : ''}` }"
          />

          <BottomBarSpacer />
          <BottomBar>
            <div class="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto">
              <UButton
                :label="justSaved ? t('orders.order.printAgain') : t('orders.order.print')"
                icon="i-lucide-printer"
                size="xl"
                block
                :loading="printing"
                data-testid="print"
                @click="print"
              />
              <UButton
                v-if="can('order:create')"
                :label="t('orders.order.nextOrder')"
                icon="i-lucide-arrow-right"
                color="neutral"
                variant="outline"
                size="xl"
                block
                to="/orders/new"
                data-testid="next-order"
              />
            </div>
          </BottomBar>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
