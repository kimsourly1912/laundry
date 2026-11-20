<script setup lang="ts">
/**
 * The customer of a new order (D39; product notes → New order: "find or create the customer"):
 * type a name or a phone, pick one, or add a new one. Optional: a walk-in has none.
 */
import type { Page } from '#shared/contracts/common'
import type { Customer } from '#shared/contracts/customers'
import { formatPhone } from '#shared/contracts/phone'
import CustomerModal from './CustomerModal.vue'

/** Who the order is for: what the picker needs of a customer (Cancel and copy has only these). */
export type CustomerChoice = Pick<Customer, 'id' | 'name' | 'phone'>

const customer = defineModel<CustomerChoice | null>({ required: true })

const { t } = useI18n()
const { can } = useSession()
const searchTerm = ref('')
// Typing settles before it searches, so each key press isn't a request.
const search = ref('')
let typing: ReturnType<typeof setTimeout> | undefined
watch(searchTerm, (value) => {
  clearTimeout(typing)
  typing = setTimeout(() => {
    search.value = value.trim()
  }, 250)
})
onBeforeUnmount(() => clearTimeout(typing))
const found = useApiQuery(() => `customers:pick:${search.value}`, () => apiFetch<Page<Customer>>('/shop/customers', { query: { search: search.value, pageSize: 8 } }))

const items = computed(() => (found.data.value?.items ?? []).map((item): { label: string, description?: string, customer: CustomerChoice } => ({
  label: item.name,
  description: item.phone ? formatPhone(item.phone) : undefined,
  customer: item,
})))
const selected = computed({
  get: () => (customer.value ? { label: customer.value.name, description: customer.value.phone ? formatPhone(customer.value.phone) : undefined, customer: customer.value } : undefined),
  set: (item) => {
    customer.value = item?.customer ?? null
  },
})

const adding = ref(false)
const typed = ref('')
function add(text: string) {
  typed.value = text
  adding.value = true
}
</script>

<template>
  <div class="flex gap-2">
    <UInputMenu
      v-model="selected"
      v-model:search-term="searchTerm"
      :items="items"
      ignore-filter
      :create-item="can('customer:write') ? 'always' : false"
      :placeholder="t('customers.pick.placeholder')"
      icon="i-lucide-user"
      class="min-w-0 flex-1"
      :loading="found.pending.value"
      :aria-label="t('customers.pick.label')"
      data-testid="customer-picker"
      @create="add"
    >
      <template #create-item-label="{ item }">
        {{ t('customers.pick.add', { text: item }) }}
      </template>
      <template #empty>
        {{ t('customers.pick.none') }}
      </template>
    </UInputMenu>
    <UButton
      v-if="customer"
      icon="i-lucide-x"
      color="neutral"
      variant="ghost"
      :aria-label="t('customers.pick.clear')"
      @click="customer = null"
    />
    <CustomerModal
      v-model:open="adding"
      :start="typed"
      @saved="value => customer = value"
    />
  </div>
</template>
