<script setup lang="ts">
/**
 * What can happen to a saved order (plan §3 step 7, §4; implementation guide → sheets 03, 04, 11):
 * Mark paid, Picked up, Cancel, and Cancel and copy, each shown only when the order's state allows
 * it and the session holds its statement. The server checks both again. Picked up unpaid, Cancel and
 * Cancel and copy ask first and say what they do.
 */
import type { OrderDetail } from '#shared/contracts/orders'

const props = defineProps<{ order: OrderDetail }>()
const emit = defineEmits<{ changed: [order: OrderDetail], reload: [] }>()

const { t, te } = useI18n()
const router = useRouter()
const { can } = useSession()

const open = computed(() => props.order.status === 'open')
const stage = computed(() => props.order.stage)
const canPay = computed(() => can('order:pay') && !props.order.paid && props.order.status !== 'cancelled')
// D39: Received → In progress → Ready → Collected; rework from Ready.
const canStart = computed(() => can('order:work') && open.value && stage.value === 'received')
const canReady = computed(() => can('order:work') && open.value && stage.value !== 'ready')
const canRework = computed(() => can('order:work') && open.value && stage.value === 'ready')
const canPickUp = computed(() => can('order:pick-up') && open.value && stage.value === 'ready')
const canCancel = computed(() => can('order:cancel') && open.value)

/** One key per Mark paid tap, kept for its retries; a new one after it succeeds. */
let paymentKey = crypto.randomUUID()
const pay = useMutation(() => apiFetch<OrderDetail>(`/shop/orders/${props.order.id}/payment`, {
  method: 'POST',
  body: { version: props.order.version },
  headers: { 'Idempotency-Key': paymentKey },
}), { inline: true, invalidate: ['orders'], success: () => t('orders.actions.paidDone') })
const pickUp = useMutation(() => apiFetch<OrderDetail>(`/shop/orders/${props.order.id}/pick-up`, { method: 'POST', body: { version: props.order.version } }), { inline: true, invalidate: ['orders'], success: () => t('orders.actions.pickedUpDone') })
const workStep = useMutation((step: 'start' | 'ready' | 'rework') => apiFetch<OrderDetail>(`/shop/orders/${props.order.id}/${step}`, { method: 'POST', body: { version: props.order.version } }), { inline: true, invalidate: ['orders'] })
const cancel = useMutation(() => apiFetch<OrderDetail>(`/shop/orders/${props.order.id}/cancel`, { method: 'POST', body: { version: props.order.version } }), { inline: true, invalidate: ['orders'] })

const pending = computed(() => pay.pending.value || pickUp.pending.value || cancel.pending.value || workStep.pending.value)
const error = computed(() => pay.error.value ?? pickUp.error.value ?? cancel.error.value ?? workStep.error.value)
const stale = computed(() => error.value?.code === 'VERSION_CONFLICT' || error.value?.code === 'INVALID_STATE')

async function step(name: 'start' | 'ready' | 'rework') {
  reset()
  const result = await workStep.execute(name)
  if (result.ok) emit('changed', result.data)
}

function reset() {
  workStep.reset()
  pay.reset()
  pickUp.reset()
  cancel.reset()
}

async function markPaid() {
  reset()
  const result = await pay.execute(undefined)
  if (result.ok) {
    paymentKey = crypto.randomUUID()
    emit('changed', result.data)
  }
}

type Confirm = 'pick-up-unpaid' | 'cancel' | 'copy'
const confirming = ref<Confirm | null>(null)

function askPickUp() {
  if (props.order.paid) void doPickUp()
  else confirming.value = 'pick-up-unpaid'
}

async function doPickUp() {
  reset()
  const result = await pickUp.execute(undefined)
  confirming.value = null
  if (result.ok) emit('changed', result.data)
}

async function doCancel(copy: boolean) {
  reset()
  const result = await cancel.execute(undefined)
  confirming.value = null
  if (!result.ok) return
  emit('changed', result.data)
  // Cancel and copy (D36): a new order, filled with this one's details; it gets its own number.
  if (copy) await router.push({ path: '/orders/new', query: { copy: result.data.id } })
}

const confirmTitle = computed(() => {
  switch (confirming.value) {
    case 'pick-up-unpaid': return t('orders.actions.pickUpUnpaidTitle')
    case 'cancel': return t('orders.actions.cancelTitle', { number: props.order.number })
    case 'copy': return t('orders.actions.copyTitle', { number: props.order.number })
    default: return ''
  }
})
const confirmDescription = computed(() => {
  switch (confirming.value) {
    case 'pick-up-unpaid': return t('orders.actions.pickUpUnpaidDescription')
    case 'cancel': return props.order.paid ? t('orders.actions.cancelPaidDescription') : t('orders.actions.cancelDescription')
    case 'copy': return t(props.order.paid ? 'orders.actions.copyPaidDescription' : 'orders.actions.copyDescription', { number: props.order.number })
    default: return ''
  }
})
const confirmLabel = computed(() => {
  switch (confirming.value) {
    case 'pick-up-unpaid': return t('orders.actions.pickUpUnpaid')
    case 'cancel': return t('orders.actions.cancel')
    case 'copy': return t('orders.actions.copy')
    default: return ''
  }
})
function confirm() {
  if (confirming.value === 'pick-up-unpaid') void doPickUp()
  else if (confirming.value === 'cancel') void doCancel(false)
  else if (confirming.value === 'copy') void doCancel(true)
}
</script>

<template>
  <div
    v-if="canPay || canStart || canReady || canRework || canPickUp || canCancel || error"
    class="space-y-3 print:hidden"
  >
    <UAlert
      v-if="error && stale"
      color="warning"
      variant="subtle"
      icon="i-lucide-refresh-cw"
      :title="errorText(error, t, te)"
      :actions="[{ label: t('common.actions.reload'), color: 'neutral', variant: 'outline', onClick: () => { reset(); $emit('reload') } }]"
      data-testid="action-conflict"
    />
    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="errorText(error, t, te)"
      role="alert"
    />

    <div class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      <UButton
        v-if="canReady"
        :label="t('orders.actions.markReady')"
        icon="i-lucide-bell-ring"
        block
        class="sm:w-auto"
        :loading="workStep.pending.value"
        :disabled="pending && !workStep.pending.value"
        data-testid="mark-ready"
        @click="step('ready')"
      />
      <UButton
        v-if="canStart"
        :label="t('orders.actions.start')"
        icon="i-lucide-play"
        color="neutral"
        variant="outline"
        block
        class="sm:w-auto"
        :disabled="pending"
        data-testid="start-work"
        @click="step('start')"
      />
      <UButton
        v-if="canRework"
        :label="t('orders.actions.rework')"
        icon="i-lucide-rotate-ccw"
        color="neutral"
        variant="outline"
        block
        class="sm:w-auto"
        :disabled="pending"
        data-testid="rework"
        @click="step('rework')"
      />
      <UButton
        v-if="canPay"
        :label="t('orders.actions.markPaid')"
        icon="i-lucide-banknote"
        block
        class="sm:w-auto"
        :loading="pay.pending.value"
        :disabled="pending && !pay.pending.value"
        data-testid="mark-paid"
        @click="markPaid"
      />
      <UButton
        v-if="canPickUp"
        :label="t('orders.actions.pickUp')"
        icon="i-lucide-package-check"
        color="primary"
        variant="solid"
        block
        class="sm:w-auto"
        :loading="pickUp.pending.value"
        :disabled="pending && !pickUp.pending.value"
        data-testid="pick-up"
        @click="askPickUp"
      />
      <UButton
        v-if="canCancel"
        :label="t('orders.actions.copy')"
        icon="i-lucide-copy"
        color="neutral"
        variant="outline"
        block
        class="sm:w-auto"
        :disabled="pending"
        data-testid="cancel-copy"
        @click="confirming = 'copy'"
      />
      <UButton
        v-if="canCancel"
        :label="t('orders.actions.cancel')"
        icon="i-lucide-x"
        color="error"
        variant="ghost"
        block
        class="sm:w-auto"
        :disabled="pending"
        data-testid="cancel"
        @click="confirming = 'cancel'"
      />
    </div>

    <UModal
      :open="confirming !== null"
      :title="confirmTitle"
      :description="confirmDescription"
      :dismissible="!pending"
      @update:open="value => { if (!value) confirming = null }"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            :label="t('common.actions.back')"
            color="neutral"
            variant="ghost"
            :disabled="pending"
            @click="confirming = null"
          />
          <UButton
            :label="confirmLabel"
            :color="confirming === 'pick-up-unpaid' ? 'primary' : 'error'"
            :loading="pending"
            data-testid="confirm"
            @click="confirm"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
