<script setup lang="ts">
/**
 * A customer (spec §4): new, or the profile to edit and anonymize. A phone another customer has
 * offers that customer instead (spec §16). The page puts their orders in the `after` slot (the orders
 * feature's history); Telegram joins with M4.
 */
import type { FormSubmitEvent } from '@nuxt/ui'
import type { Customer } from '#shared/contracts/customers'
import { findCustomerByPhone } from '../composables/useCustomerByPhone'
import type { CustomerForm } from '../schemas/customer-form'
import { customerFormSchema, toCustomerForm, toCustomerRequest } from '../schemas/customer-form'

const props = defineProps<{ id?: string }>()
const { t, te } = useI18n()
const { can } = useSession()
const customer = props.id ? useApiQuery(() => `customers:customer:${props.id}`, () => apiFetch<Customer>(`/shop/customers/${props.id}`)) : undefined
const record = computed(() => customer?.data.value ?? undefined)
const missing = computed(() => customer?.error.value?.kind === 'not_found')

const schema = computed(() => customerFormSchema(t))
const state = reactive<CustomerForm>(toCustomerForm())
const baseline = ref(JSON.stringify(state))
const form = useTemplateRef('form')
useFormErrorRecheck(form)
watch(record, (value) => {
  if (!value) return
  Object.assign(state, toCustomerForm(value))
  baseline.value = JSON.stringify(state)
}, { immediate: true })
const dirty = computed(() => JSON.stringify(state) !== baseline.value)

const save = useMutation((body: CustomerForm) => (record.value
  ? apiFetch<Customer>(`/shop/customers/${record.value.id}`, { method: 'PATCH', body: { ...toCustomerRequest(body), version: record.value.version } })
  : apiFetch<Customer>('/shop/customers', { method: 'POST', body: toCustomerRequest(body) })), {
  inline: true,
  invalidate: ['customers'],
  success: () => t('customers.saved'),
})
const anonymize = useMutation(() => apiFetch<Customer>(`/shop/customers/${record.value!.id}/anonymize`, { method: 'POST', body: { version: record.value!.version } }), {
  invalidate: ['customers'],
  success: () => t('customers.anonymizedDone'),
})
useUnsavedChanges(() => dirty.value && !save.pending.value)
const failure = computed(() => (save.error.value && !save.error.value.fieldErrors ? errorText(save.error.value, t, te) : undefined))
/** The customer who already has the typed phone (after `409 PHONE_TAKEN`). */
const existing = ref<Customer>()
const confirming = ref(false)

async function onSubmit(event: FormSubmitEvent<CustomerForm>) {
  existing.value = undefined
  const result = await save.execute(event.data)
  if (result.ok) {
    baseline.value = JSON.stringify(state)
    if (!record.value) await navigateTo(`/customers/${result.data.id}`)
    return
  }
  if (result.error.code === 'PHONE_TAKEN') {
    form.value?.setErrors([{ name: 'phone', message: t('errors.code.PHONE_TAKEN') }])
    const other = await findCustomerByPhone(event.data.phone)
    existing.value = other?.id === record.value?.id ? undefined : other
  }
  else if (result.error.fieldErrors) {
    form.value?.setErrors(formErrors(result.error.fieldErrors))
  }
}

/** The person chose the customer who has the phone: what they typed here is no longer wanted. */
function openExisting() {
  baseline.value = JSON.stringify(state)
  return navigateTo(`/customers/${existing.value!.id}`)
}

/** After a conflict: the customer as saved now, the person's own changes dropped (they re-type). */
function reload() {
  save.reset()
  void customer?.refresh()
}

async function onAnonymize() {
  const result = await anonymize.execute(undefined)
  confirming.value = false
  if (result.ok) baseline.value = JSON.stringify(state)
}
</script>

<template>
  <UDashboardPanel id="customer">
    <template #header>
      <UDashboardNavbar :title="record ? (record.anonymized ? t('customers.former') : record.name) : id ? t('customers.title') : t('customers.new')">
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            :aria-label="t('customers.back')"
            to="/customers"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-xl space-y-6">
        <UEmpty
          v-if="missing"
          icon="i-lucide-user-x"
          :title="t('customers.notFound')"
          :actions="[{ label: t('customers.back'), color: 'neutral', variant: 'outline', to: '/customers' }]"
        />
        <PageLoadError
          v-else-if="customer?.error.value && !record"
          :error="customer.error.value"
          @retry="customer.refresh()"
        />
        <USkeleton
          v-else-if="id && !record"
          class="h-48 w-full"
        />
        <UAlert
          v-else-if="record?.anonymized"
          color="neutral"
          variant="subtle"
          icon="i-lucide-user-x"
          :title="t('customers.former')"
          :description="t('customers.formerDescription')"
        />
        <UForm
          v-else
          ref="form"
          :schema="schema"
          :state="state"
          :validate-on="['input', 'change']"
          :disabled="save.pending.value || !can('customer:write')"
          class="space-y-6"
          @submit="onSubmit"
          @error="focusFirstError"
        >
          <UAlert
            v-if="existing"
            color="info"
            variant="subtle"
            icon="i-lucide-user-check"
            :title="t('customers.phoneTakenBy', { name: existing.name })"
            :actions="[{ label: t('customers.openExisting', { name: existing.name }), color: 'neutral', variant: 'outline', onClick: openExisting }]"
          />
          <UAlert
            v-else-if="failure"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="failure"
            role="alert"
            :actions="save.error.value?.code === 'VERSION_CONFLICT' ? [{ label: t('common.actions.reload'), color: 'neutral', variant: 'outline', onClick: reload }] : []"
          />
          <UPageCard variant="subtle">
            <UFormField
              :label="t('customers.name')"
              name="name"
              required
            >
              <UInput
                v-model="state.name"
                autocomplete="off"
                class="w-full"
              />
            </UFormField>
            <UFormField
              :label="t('customers.phone')"
              :help="t('customers.phoneHelp')"
              name="phone"
            >
              <UInput
                v-model="state.phone"
                type="tel"
                inputmode="tel"
                autocomplete="off"
                class="w-full"
              />
            </UFormField>
            <UFormField
              :label="t('customers.note')"
              name="note"
            >
              <UTextarea
                v-model="state.note"
                :rows="2"
                autoresize
                class="w-full"
              />
            </UFormField>
          </UPageCard>
          <div class="flex flex-wrap justify-between gap-3">
            <UButton
              v-if="record && can('customer:anonymize')"
              :label="t('customers.anonymize')"
              icon="i-lucide-user-x"
              color="error"
              variant="ghost"
              @click="confirming = true"
            />
            <UButton
              v-if="can('customer:write')"
              type="submit"
              :label="record ? t('common.actions.save') : t('customers.create')"
              :loading="save.pending.value"
              :disabled="Boolean(record) && !dirty"
              class="ms-auto"
            />
          </div>
        </UForm>
        <slot
          v-if="record"
          name="after"
        />
      </div>

      <UModal
        :open="confirming"
        :title="t('customers.anonymizeConfirm', { name: record?.name })"
        :description="t('customers.anonymizeDescription')"
        :dismissible="!anonymize.pending.value"
        @update:open="open => { confirming = open }"
      >
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton
              :label="t('common.actions.cancel')"
              color="neutral"
              variant="ghost"
              :disabled="anonymize.pending.value"
              @click="confirming = false"
            />
            <UButton
              :label="t('customers.anonymize')"
              color="error"
              :loading="anonymize.pending.value"
              @click="onAnonymize()"
            />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
