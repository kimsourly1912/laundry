<script setup lang="ts">
/**
 * Add a customer, or correct one (D39): name and an optional phone. A short form in a modal
 * (page-patterns → Detail / editor). The server checks the phone and refuses another customer's.
 */
import type { Customer } from '#shared/contracts/customers'
import { CUSTOMER_NAME_MAX } from '#shared/contracts/customers'
import { formatPhone, toE164 } from '#shared/contracts/phone'

const props = defineProps<{
  /** Correct this customer; add a new one when absent. */
  customer?: Customer
  /** What the owner typed in the picker: a phone or a name. */
  start?: string
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [customer: Customer] }>()

const { t, te } = useI18n()
const name = ref('')
const phone = ref('')
watch(open, (value) => {
  if (!value) return
  if (props.customer) {
    name.value = props.customer.name
    phone.value = props.customer.phone ? formatPhone(props.customer.phone) : ''
  }
  else {
    const typed = props.start?.trim() ?? ''
    const asPhone = typed && toE164(typed)
    name.value = asPhone ? '' : typed
    phone.value = asPhone ? typed : ''
  }
}, { immediate: true })

const save = useMutation((body: { name: string, phone: string }) => props.customer
  ? apiFetch<Customer>(`/shop/customers/${props.customer.id}`, { method: 'PATCH', body: { ...body, version: props.customer.version } })
  : apiFetch<Customer>('/shop/customers', { method: 'POST', body }), { inline: true, invalidate: ['customers'] })

const nameError = computed(() => save.error.value?.fieldErrors?.name?.[0])
const phoneError = computed(() => {
  if (phone.value.trim() && !toE164(phone.value)) return t('customers.form.badPhone')
  return save.error.value?.fieldErrors?.phone?.[0]
})
const failure = computed(() => (save.error.value && !save.error.value.fieldErrors ? errorText(save.error.value, t, te) : undefined))

async function submit() {
  if (!name.value.trim() || phoneError.value) return
  const result = await save.execute({ name: name.value.trim(), phone: phone.value.trim() })
  if (!result.ok) return
  emit('saved', result.data)
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="customer ? t('customers.form.editTitle') : t('customers.form.newTitle')"
    :dismissible="!save.pending.value"
  >
    <template #body>
      <form
        id="customer-form"
        class="space-y-4"
        @submit.prevent="submit"
      >
        <UAlert
          v-if="failure"
          color="error"
          variant="subtle"
          :title="failure"
          role="alert"
        />
        <UFormField
          :label="t('customers.form.name')"
          :error="nameError"
          required
        >
          <UInput
            v-model="name"
            :maxlength="CUSTOMER_NAME_MAX"
            size="xl"
            class="w-full"
            autocomplete="off"
            data-testid="customer-name"
          />
        </UFormField>
        <UFormField
          :label="t('customers.form.phone')"
          :error="phoneError"
          :hint="t('common.optional')"
        >
          <UInput
            v-model="phone"
            type="tel"
            inputmode="tel"
            size="xl"
            class="w-full"
            autocomplete="off"
            placeholder="012 345 678"
            data-testid="customer-phone"
          />
        </UFormField>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          :label="t('common.actions.cancel')"
          color="neutral"
          variant="ghost"
          :disabled="save.pending.value"
          @click="open = false"
        />
        <UButton
          type="submit"
          form="customer-form"
          :label="t('customers.form.save')"
          :loading="save.pending.value"
          :disabled="!name.trim()"
          data-testid="customer-save"
        />
      </div>
    </template>
  </UModal>
</template>
