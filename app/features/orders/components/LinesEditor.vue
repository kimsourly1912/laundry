<script setup lang="ts">
/**
 * An order's lines, inside the caller's `UForm` (fields `lines.<i>.quantity`): one row per line with
 * its quantity, and "Add line" from the shop's active price list, grouped by service type. Kept
 * lines show their own names and price; the server prices and totals again on save.
 */
import type { Currency } from '#shared/contracts/shop-settings'
import { MAX_ORDER_LINES } from '#shared/contracts/orders'
import { usePriceItems, useServiceTypes } from '~/features/pricing'
import type { DraftLine } from '../schemas/order-lines'
import { draftFromPriceItem, draftTotal, previewTotal } from '../schemas/order-lines'

const props = defineProps<{ currency: Currency, disabled?: boolean }>()
const lines = defineModel<DraftLine[]>({ required: true })
const { t, locale } = useI18n()
const types = useServiceTypes('active')
const items = usePriceItems('active')

const options = computed(() => (types.data.value?.items ?? []).map(type => [
  { type: 'label' as const, label: localName(type, locale.value) },
  ...(items.data.value?.items ?? []).filter(item => item.serviceTypeId === type.id).map(item => ({
    label: localName(item, locale.value),
    description: `${formatMoney(item.price, props.currency, locale.value)} / ${t(`orders.unit.${item.unit}`)}`,
    value: item.id,
  })),
]).filter(group => group.length > 1))

type Option = { label: string, description: string, value: string }
const picked = ref<Option>()
function add(option: Option | undefined) {
  const item = items.data.value?.items.find(entry => entry.id === option?.value)
  const type = types.data.value?.items.find(entry => entry.id === item?.serviceTypeId)
  if (!item || !type) return
  lines.value = [...lines.value, draftFromPriceItem(item, type)]
  nextTick(() => {
    picked.value = undefined
    document.getElementById(`line-${lines.value.length - 1}-quantity`)?.focus()
  })
}

function remove(key: string) {
  lines.value = lines.value.filter(line => line.key !== key)
}

const total = computed(() => previewTotal(lines.value))
const lineName = (line: DraftLine) => `${localName({ nameEn: line.serviceNameEn, nameKm: line.serviceNameKm }, locale.value)} · ${localName({ nameEn: line.itemNameEn, nameKm: line.itemNameKm }, locale.value)}`
</script>

<template>
  <div class="space-y-3">
    <UFormField name="lines">
      <ul
        v-if="lines.length"
        class="divide-y divide-default rounded-md border border-default"
      >
        <li
          v-for="(line, index) in lines"
          :key="line.key"
          class="space-y-2 px-3 py-3"
        >
          <div class="flex items-start justify-between gap-2">
            <p class="min-w-0 font-medium break-words">
              {{ lineName(line) }}
            </p>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="t('orders.lines.remove', { name: lineName(line) })"
              :disabled="disabled"
              @click="remove(line.key)"
            />
          </div>
          <div class="flex items-end justify-between gap-3">
            <UFormField
              :label="line.unit === 'piece' ? t('orders.lines.pieces') : t('orders.lines.kg')"
              :name="`lines.${index}.quantity`"
              class="w-32"
            >
              <UInput
                :id="`line-${index}-quantity`"
                v-model="line.quantity"
                :inputmode="line.unit === 'piece' ? 'numeric' : 'decimal'"
                autocomplete="off"
                :disabled="disabled"
                class="w-full"
              />
            </UFormField>
            <p class="pb-1.5 text-end text-sm tabular-nums">
              <span class="block text-muted">{{ formatMoney(line.unitPrice, currency, locale) }} / {{ t(`orders.unit.${line.unit}`) }}</span>
              <span class="block font-medium">{{ draftTotal(line) === null ? '—' : formatMoney(draftTotal(line)!, currency, locale) }}</span>
            </p>
          </div>
        </li>
      </ul>
    </UFormField>

    <USelectMenu
      v-if="lines.length < MAX_ORDER_LINES"
      v-model="picked"
      :items="options"
      :placeholder="t('orders.lines.add')"
      :search-input="{ placeholder: t('orders.lines.search') }"
      :loading="items.loading.value || types.loading.value"
      :disabled="disabled"
      icon="i-lucide-plus"
      :aria-label="t('orders.lines.add')"
      class="w-full"
      @update:model-value="add"
    />
    <p
      v-if="items.data.value && !items.data.value.items.length"
      class="text-sm text-muted"
    >
      {{ t('orders.lines.noPrices') }}
      <ULink
        to="/prices"
        class="underline"
      >
        {{ t('orders.lines.openPrices') }}
      </ULink>
    </p>

    <div class="flex items-center justify-between border-t border-default pt-3 font-semibold">
      <span>{{ t('orders.total') }}</span>
      <span class="tabular-nums">{{ formatMoney(total, currency, locale) }}</span>
    </div>
  </div>
</template>
