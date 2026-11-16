<script setup lang="ts">
/**
 * Edit an order's lines and note (spec P6; a page, not a modal: D22) while it's received or in
 * progress. Kept lines keep their price; new ones take today's. Saves with the version read. A paid
 * order's lines are locked (D24): only the note changes.
 */
import type { Order } from '#shared/contracts/orders'
import { isEditable, ORDER_NOTE_MAX } from '#shared/contracts/orders'
import type { DraftLine } from '../schemas/order-lines'
import { draftFromLine, lineErrors, toUpdateLines } from '../schemas/order-lines'
import LinesEditor from './LinesEditor.vue'

const props = defineProps<{ id: string }>()
const { t, te } = useI18n()
const order = useApiQuery(() => `orders:order:${props.id}`, () => apiFetch<Order>(`/shop/orders/${props.id}`))
const record = computed(() => order.data.value ?? undefined)
const missing = computed(() => order.error.value?.kind === 'not_found')
const locked = computed(() => record.value?.paymentStatus === 'paid')

const state = reactive<{ lines: DraftLine[], note: string }>({ lines: [], note: '' })
const snapshot = () => JSON.stringify({ lines: state.lines.map(line => [line.lineId ?? line.priceItemId, line.quantity]), note: state.note.trim() })
const baseline = ref(snapshot())
watch(record, (value) => {
  if (!value) return
  state.lines = value.lines.map(draftFromLine)
  state.note = value.note ?? ''
  baseline.value = snapshot()
}, { immediate: true })
const dirty = computed(() => snapshot() !== baseline.value)

const form = useTemplateRef('form')
useFormErrorRecheck(form)
const save = useMutation(() => apiFetch<Order>(`/shop/orders/${props.id}`, {
  method: 'PATCH',
  body: { version: record.value!.version, lines: toUpdateLines(state.lines), note: state.note },
}), { inline: true, invalidate: ['orders'], success: () => t('orders.saved') })
useUnsavedChanges(() => dirty.value && !save.pending.value)
const failure = computed(() => (save.error.value && !save.error.value.fieldErrors ? errorText(save.error.value, t, te) : undefined))

async function onSubmit() {
  const result = await save.execute(undefined)
  if (result.ok) {
    baseline.value = snapshot()
    await navigateTo(`/orders/${props.id}`)
  }
  else if (result.error.fieldErrors) {
    form.value?.setErrors(formErrors(result.error.fieldErrors).map(error => ({ ...error, name: error.name.replace(/\.(priceItemId|lineId)$/, '.quantity') })))
  }
}

/** After a conflict: the order as saved now; the person's changes are dropped. */
function reload() {
  save.reset()
  void order.refresh()
}
</script>

<template>
  <UDashboardPanel id="order-edit">
    <template #header>
      <UDashboardNavbar :title="record ? t('orders.editTitle', { number: record.number }) : t('orders.titleLoading')">
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            :aria-label="t('orders.backToOrder')"
            :to="`/orders/${id}`"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-page space-y-6">
        <UEmpty
          v-if="missing"
          icon="i-lucide-file-x"
          :title="t('orders.notFound')"
          :actions="[{ label: t('orders.back'), color: 'neutral', variant: 'outline', to: '/orders' }]"
        />
        <PageLoadError
          v-else-if="order.error.value && !record"
          :error="order.error.value"
          @retry="order.refresh()"
        />
        <USkeleton
          v-else-if="!record"
          class="h-64 w-full"
        />
        <UAlert
          v-else-if="!isEditable(record.status)"
          color="neutral"
          variant="subtle"
          icon="i-lucide-lock"
          :title="t('orders.notEditable')"
          :actions="[{ label: t('orders.backToOrder'), color: 'neutral', variant: 'outline', to: `/orders/${id}` }]"
        />
        <UForm
          v-else
          ref="form"
          :state="state"
          :validate="() => lineErrors(state.lines, t)"
          :validate-on="['input', 'change']"
          :disabled="save.pending.value"
          class="space-y-6"
          @submit="onSubmit"
          @error="focusFirstError"
        >
          <UAlert
            v-if="failure"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="failure"
            role="alert"
            :actions="save.error.value?.code === 'VERSION_CONFLICT' ? [{ label: t('common.actions.reload'), color: 'neutral', variant: 'outline', onClick: reload }] : []"
          />
          <UAlert
            v-if="locked"
            color="info"
            variant="subtle"
            icon="i-lucide-lock"
            :title="t('orders.paidLocked')"
          />
          <LinesEditor
            v-model="state.lines"
            :currency="record.currency"
            :disabled="locked"
          />
          <UFormField
            :label="t('orders.note')"
            name="note"
          >
            <UTextarea
              v-model="state.note"
              :rows="2"
              :maxlength="ORDER_NOTE_MAX"
              autoresize
              class="w-full"
            />
          </UFormField>
          <BottomBar>
            <UButton
              :label="t('common.actions.cancel')"
              color="neutral"
              variant="ghost"
              :to="`/orders/${id}`"
            />
            <UButton
              type="submit"
              :label="t('common.actions.save')"
              :loading="save.pending.value"
              :disabled="!dirty"
            />
          </BottomBar>
          <BottomBarSpacer />
        </UForm>
      </div>
    </template>
  </UDashboardPanel>
</template>
