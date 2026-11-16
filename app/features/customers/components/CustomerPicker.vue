<script setup lang="ts">
/**
 * Choose an order's customer (spec §8.1): search by phone or name, or add a new one right here. A
 * phone another customer has offers that customer (spec §16). Used by the new-order flow.
 */
import type { Page } from '#shared/contracts/common'
import type { Customer } from '#shared/contracts/customers'
import { formatPhone } from '#shared/contracts/phone'
import { findCustomerByPhone } from '../composables/useCustomerByPhone'
import { customerFormSchema, toCustomerForm, toCustomerRequest } from '../schemas/customer-form'
import type { CustomerForm } from '../schemas/customer-form'

const customer = defineModel<Customer | undefined>({ required: true })
const { t, te } = useI18n()
const { can } = useSession()

const search = ref('')
const settled = ref('')
let typing: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(typing)
  typing = setTimeout(() => {
    settled.value = value.trim()
  }, 300)
})
onBeforeUnmount(() => clearTimeout(typing))
const results = useApiQuery(() => `customers:picker:${settled.value}`, () => (settled.value
  ? apiFetch<Page<Customer>>('/shop/customers', { query: { search: settled.value, pageSize: 10 } })
  : Promise.resolve(undefined)), { watch: [settled] })

const adding = ref(false)
const schema = computed(() => customerFormSchema(t))
const state = reactive<CustomerForm>(toCustomerForm())
const form = useTemplateRef('form')
useFormErrorRecheck(form)
const create = useMutation((body: CustomerForm) => apiFetch<Customer>('/shop/customers', { method: 'POST', body: toCustomerRequest(body) }), { inline: true, invalidate: ['customers'] })
const existing = ref<Customer>()
const failure = computed(() => (create.error.value && !create.error.value.fieldErrors ? errorText(create.error.value, t, te) : undefined))

function startAdding() {
  // What was searched is likely the new customer's phone or name.
  const typed = search.value.trim()
  Object.assign(state, toCustomerForm(), /^[\d\s+()-]+$/.test(typed) ? { phone: typed } : { name: typed })
  existing.value = undefined
  create.reset()
  adding.value = true
}

async function onCreate(event: { data: CustomerForm }) {
  existing.value = undefined
  const result = await create.execute(event.data)
  if (result.ok) {
    choose(result.data)
    return
  }
  if (result.error.code === 'PHONE_TAKEN') {
    form.value?.setErrors([{ name: 'phone', message: t('errors.code.PHONE_TAKEN') }])
    existing.value = await findCustomerByPhone(event.data.phone)
  }
  else if (result.error.fieldErrors) {
    form.value?.setErrors(formErrors(result.error.fieldErrors))
  }
}

function choose(chosen: Customer) {
  customer.value = chosen
  adding.value = false
  search.value = ''
}
</script>

<template>
  <div class="space-y-3">
    <div
      v-if="customer"
      class="flex items-center justify-between gap-3 rounded-md border border-default px-4 py-3"
    >
      <div class="min-w-0">
        <p class="font-medium break-words">
          {{ customer.name }}
        </p>
        <p class="text-sm text-muted tabular-nums">
          {{ customer.phone ? formatPhone(customer.phone) : t('customers.noPhone') }}
        </p>
      </div>
      <UButton
        :label="t('common.actions.change')"
        color="neutral"
        variant="outline"
        @click="customer = undefined"
      />
    </div>

    <UForm
      v-else-if="adding"
      ref="form"
      :schema="schema"
      :state="state"
      :validate-on="['input', 'change']"
      :disabled="create.pending.value"
      class="space-y-4"
      @submit="onCreate"
      @error="focusFirstError"
    >
      <UAlert
        v-if="existing"
        color="info"
        variant="subtle"
        icon="i-lucide-user-check"
        :title="t('customers.phoneTakenBy', { name: existing.name })"
        :actions="[{ label: t('customers.chooseExisting', { name: existing.name }), color: 'neutral', variant: 'outline', onClick: () => choose(existing!) }]"
      />
      <UAlert
        v-else-if="failure"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="failure"
        role="alert"
      />
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
      <div class="flex justify-end gap-2">
        <UButton
          :label="t('common.actions.cancel')"
          color="neutral"
          variant="ghost"
          @click="adding = false"
        />
        <UButton
          type="submit"
          :label="t('customers.create')"
          :loading="create.pending.value"
        />
      </div>
    </UForm>

    <template v-else>
      <UInput
        v-model="search"
        :placeholder="t('customers.search')"
        :aria-label="t('customers.search')"
        icon="i-lucide-search"
        type="search"
        autofocus
        class="w-full"
      />
      <ul
        v-if="results.data.value?.items.length"
        class="divide-y divide-default rounded-md border border-default"
      >
        <li
          v-for="match in results.data.value.items"
          :key="match.id"
        >
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 px-4 py-3 text-start hover:bg-elevated/50 focus-visible:outline-2 focus-visible:outline-primary"
            @click="choose(match)"
          >
            <span class="min-w-0 font-medium break-words">{{ match.name }}</span>
            <span class="shrink-0 text-sm text-muted tabular-nums">{{ match.phone ? formatPhone(match.phone) : t('customers.noPhone') }}</span>
          </button>
        </li>
      </ul>
      <p
        v-else-if="settled && results.data.value"
        class="text-sm text-muted"
      >
        {{ t('customers.noMatch') }}
      </p>
      <UButton
        v-if="can('customer:write')"
        :label="t('customers.new')"
        icon="i-lucide-user-plus"
        color="neutral"
        variant="outline"
        block
        @click="startAdding"
      />
    </template>
  </div>
</template>
