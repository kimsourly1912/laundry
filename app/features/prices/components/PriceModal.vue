<script setup lang="ts">
/**
 * Add a price, or change one (D39): a stable key (set once: slips are linked to it), a label, per
 * piece or per kg, and the price in the shop's currency.
 */
import type { PriceItem } from '#shared/contracts/prices'
import type { Currency } from '#shared/contracts/shop-settings'

const props = defineProps<{ item?: PriceItem, currency: Currency }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [item: PriceItem] }>()

const { t, te } = useI18n()
const key = ref('')
const label = ref('')
const unit = ref<'piece' | 'kg'>('piece')
const priceText = ref('')
watch(open, (value) => {
  if (!value) return
  key.value = props.item?.key ?? ''
  label.value = props.item?.label ?? ''
  unit.value = props.item?.unit ?? 'piece'
  priceText.value = props.item ? moneyInput(props.item.price, props.currency) : ''
}, { immediate: true })

const price = computed(() => parseMoney(priceText.value, props.currency))
const save = useMutation(() => {
  const body = { label: label.value.trim(), unit: unit.value, price: price.value! }
  return props.item
    ? apiFetch<PriceItem>(`/shop/prices/${props.item.id}`, { method: 'PATCH', body: { ...body, version: props.item.version } })
    : apiFetch<PriceItem>('/shop/prices', { method: 'POST', body: { ...body, key: key.value.trim().toLowerCase() } })
}, { inline: true, invalidate: ['prices', 'orders'] })
const fieldError = (name: string) => save.error.value?.fieldErrors?.[name]?.[0]
const failure = computed(() => (save.error.value && !save.error.value.fieldErrors ? errorText(save.error.value, t, te) : undefined))
const valid = computed(() => label.value.trim() && price.value !== null && (props.item || /^[a-z\d][a-z\d._-]{0,39}$/.test(key.value.trim().toLowerCase())))

async function submit() {
  if (!valid.value) return
  const result = await save.execute(undefined)
  if (!result.ok) return
  emit('saved', result.data)
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="item ? t('prices.form.editTitle') : t('prices.form.newTitle')"
    :dismissible="!save.pending.value"
  >
    <template #body>
      <form
        id="price-form"
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
          :label="t('prices.form.key')"
          :help="item ? t('prices.form.keyFixed') : t('prices.form.keyHelp')"
          :error="fieldError('key')"
          required
        >
          <UInput
            v-model="key"
            :disabled="Boolean(item)"
            autocomplete="off"
            autocapitalize="off"
            size="xl"
            class="w-full"
            placeholder="shirt"
            data-testid="price-key"
          />
        </UFormField>
        <UFormField
          :label="t('prices.form.label')"
          :error="fieldError('label')"
          required
        >
          <UInput
            v-model="label"
            size="xl"
            class="w-full"
            data-testid="price-label"
          />
        </UFormField>
        <UFormField :label="t('prices.form.unit')">
          <URadioGroup
            v-model="unit"
            :items="[{ label: t('prices.unit.piece'), value: 'piece' }, { label: t('prices.unit.kg'), value: 'kg' }]"
            orientation="horizontal"
            variant="card"
            :ui="{ fieldset: 'gap-2', item: 'flex-1' }"
          />
        </UFormField>
        <UFormField
          :label="unit === 'kg' ? t('prices.form.pricePerKg') : t('prices.form.pricePerPiece')"
          :error="priceText.trim() && price === null ? t('prices.form.badPrice') : fieldError('price')"
          required
        >
          <UInput
            v-model="priceText"
            inputmode="decimal"
            size="xl"
            class="w-full"
            data-testid="price-amount"
          >
            <template #trailing>
              <span class="text-muted">{{ currency === 'KHR' ? '៛' : '$' }}</span>
            </template>
          </UInput>
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
          form="price-form"
          :label="t('prices.form.save')"
          :loading="save.pending.value"
          :disabled="!valid"
          data-testid="price-save"
        />
      </div>
    </template>
  </UModal>
</template>
