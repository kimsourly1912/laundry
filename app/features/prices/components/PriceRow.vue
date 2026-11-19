<script setup lang="ts">
/**
 * One item on the shop's slips (D43): its name and unit from the item list, and the amount the owner
 * types. Save sends the amount and the version read; someone else's change since then is a 409, and
 * the page reloads the list.
 */
import type { ShopPrice } from '#shared/contracts/prices'
import type { Currency } from '#shared/contracts/shop-settings'

const props = defineProps<{ item: ShopPrice, currency: Currency, canWrite: boolean }>()
const emit = defineEmits<{ saved: [] }>()
const { t, te } = useI18n()

const text = ref('')
watch(() => props.item.price, (price) => {
  text.value = price === null ? '' : moneyInput(price, props.currency)
}, { immediate: true })
const price = computed(() => parseMoney(text.value, props.currency))
const changed = computed(() => text.value.trim() !== '' && price.value !== props.item.price)

const save = useMutation(
  (body: { price: number, version: number | null }) => apiFetch<ShopPrice>(`/shop/prices/${props.item.key}`, { method: 'PUT', body }),
  { inline: true, invalidate: ['prices', 'orders'], success: () => t('prices.saved', { label: props.item.label }) },
)
const failure = computed(() => (save.error.value ? errorText(save.error.value, t, te) : undefined))
const invalid = computed(() => text.value.trim() !== '' && price.value === null)

async function submit() {
  if (!changed.value || price.value === null) return
  const result = await save.execute({ price: price.value, version: props.item.version })
  // Saved, or changed by someone else meanwhile: reload, so the row shows the price now and its version.
  if (result.ok || result.error.status === 409) emit('saved')
}
const unitText = computed(() => t(props.item.unit === 'kg' ? 'prices.unit.kg' : 'prices.unit.piece'))
</script>

<template>
  <li
    class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
    :data-testid="`price-${item.key}`"
  >
    <div class="min-w-0 flex-1">
      <p class="font-medium wrap-break-word text-highlighted">
        {{ item.label }}
      </p>
      <p class="text-sm text-muted">
        {{ unitText }}
        <UBadge
          v-if="item.onSlip && item.price === null"
          :label="t('prices.noPrice')"
          color="warning"
          variant="subtle"
          size="sm"
          class="ms-1"
        />
      </p>
    </div>
    <form
      v-if="canWrite && item.onSlip"
      class="flex items-start gap-2"
      @submit.prevent="submit"
    >
      <UFormField
        :error="invalid ? t('prices.form.badPrice') : failure"
        :ui="{ error: 'max-w-40' }"
      >
        <UInput
          v-model="text"
          inputmode="decimal"
          class="w-36"
          :placeholder="t('prices.pricePlaceholder')"
          :aria-label="t('prices.priceFor', { label: item.label, unit: unitText })"
          data-testid="price-amount"
        >
          <template #trailing>
            <span class="text-muted">{{ currency === 'KHR' ? '៛' : '$' }}</span>
          </template>
        </UInput>
      </UFormField>
      <UButton
        v-if="changed"
        type="submit"
        :label="t('prices.form.save')"
        :loading="save.pending.value"
        :disabled="price === null"
        data-testid="price-save"
      />
    </form>
    <p
      v-else-if="item.price !== null"
      class="font-medium text-highlighted"
    >
      {{ formatMoney(item.price, currency) }}
    </p>
  </li>
</template>
