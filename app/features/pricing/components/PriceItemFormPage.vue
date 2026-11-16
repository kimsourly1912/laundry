<script setup lang="ts">
/**
 * A price item: new, or edit and archive (spec §4 → Price list). The price is typed in the shop's
 * currency and sent in minor units. A new price applies to new orders only.
 */
import type { FormSubmitEvent } from '@nuxt/ui'
import type { PriceItem } from '#shared/contracts/pricing'
import { PRICE_UNITS } from '#shared/contracts/pricing'
import { usePriceItems, usePriceScope, useServiceTypes } from '../composables/usePriceList'
import type { PriceItemForm } from '../schemas/price-form'
import { priceItemFormSchema, toPriceItemForm, toPriceItemRequest } from '../schemas/price-form'

const props = defineProps<{ id?: string }>()
const { t, te, locale } = useI18n()
const route = useRoute()
const scope = usePriceScope()
const types = useServiceTypes('active')
const items = usePriceItems('active')
const currency = computed(() => scope.currency.value ?? 'KHR')
const record = computed(() => (props.id ? items.data.value?.items.find(item => item.id === props.id) : undefined))
const missing = computed(() => Boolean(props.id && items.data.value && !record.value))
const ready = computed(() => scope.currency.value && types.data.value && (!props.id || record.value))
const loadError = computed(() => scope.error.value ?? types.error.value ?? items.error.value)

const schema = computed(() => priceItemFormSchema(t, currency.value))
const state = reactive<PriceItemForm>(toPriceItemForm(undefined, 'KHR'))
const baseline = ref('')
const form = useTemplateRef('form')
useFormErrorRecheck(form)
// Filled once the item and the currency are known; a new item starts in the service type it was asked from.
watch([record, () => scope.currency.value], ([item, value]) => {
  if (!value || (props.id && !item)) return
  Object.assign(state, toPriceItemForm(item, value))
  if (!item && typeof route.query.type === 'string') state.serviceTypeId = route.query.type
  baseline.value = JSON.stringify(state)
}, { immediate: true })
const dirty = computed(() => baseline.value !== '' && JSON.stringify(state) !== baseline.value)

const save = useMutation((body: PriceItemForm) => (record.value
  ? apiFetch<PriceItem>(`${scope.api}/price-items/${record.value.id}`, { method: 'PATCH', body: { ...toPriceItemRequest(body, currency.value), version: record.value.version } })
  : apiFetch<PriceItem>(`${scope.api}/price-items`, { method: 'POST', body: toPriceItemRequest(body, currency.value) })), {
  inline: true,
  invalidate: ['pricing', 'shop-settings'],
  success: () => t('pricing.saved'),
})
const archive = useMutation(() => apiFetch<PriceItem>(`${scope.api}/price-items/${record.value!.id}`, { method: 'DELETE', query: { version: record.value!.version } }), {
  invalidate: ['pricing'],
  success: () => t('pricing.archivedDone'),
})
useUnsavedChanges(() => dirty.value && !save.pending.value)
const failure = computed(() => (save.error.value && !save.error.value.fieldErrors ? errorText(save.error.value, t, te) : undefined))
const confirming = ref(false)

async function onSubmit(event: FormSubmitEvent<PriceItemForm>) {
  const result = await save.execute(event.data)
  if (result.ok) {
    baseline.value = JSON.stringify(state)
    return navigateTo(scope.pages)
  }
  if (result.error.fieldErrors) {
    form.value?.setErrors(formErrors(result.error.fieldErrors).map(error => ({ ...error, message: te(`errors.code.${result.error.code}`) ? t(`errors.code.${result.error.code}`) : error.message })))
  }
}

async function onArchive() {
  const result = await archive.execute(undefined)
  confirming.value = false
  if (result.ok) await navigateTo(scope.pages)
}

const typeOptions = computed(() => (types.data.value?.items ?? []).map(type => ({ label: localName(type, locale.value), value: type.id })))
const unitOptions = computed(() => PRICE_UNITS.map(unit => ({ label: t(`pricing.unitChoices.${unit}`), value: unit })))
const priceLabel = computed(() => t(state.unit === 'kg' ? 'pricing.pricePerKg' : 'pricing.pricePerPiece', { currency: t(`settings.currencies.${currency.value}`) }))
</script>

<template>
  <UDashboardPanel id="price-item">
    <template #header>
      <UDashboardNavbar :title="id ? t('pricing.editItem') : t('pricing.newItem')">
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            :aria-label="t('pricing.back')"
            :to="scope.pages"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-xl space-y-6">
        <UEmpty
          v-if="missing"
          icon="i-lucide-tags"
          :title="t('pricing.notFound')"
          :actions="[{ label: t('pricing.back'), color: 'neutral', variant: 'outline', to: scope.pages }]"
        />
        <PageLoadError
          v-else-if="loadError && !ready"
          :error="loadError"
          @retry="() => { scope.refresh(); types.refresh(); items.refresh() }"
        />
        <USkeleton
          v-else-if="!ready"
          class="h-64 w-full"
        />
        <UEmpty
          v-else-if="!typeOptions.length"
          icon="i-lucide-tags"
          :title="t('pricing.needServiceType')"
          :actions="[{ label: t('pricing.newServiceType'), icon: 'i-lucide-plus', to: `${scope.pages}/types/new` }]"
        />
        <UForm
          v-else
          ref="form"
          :schema="schema"
          :state="state"
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
            :actions="save.error.value?.code === 'VERSION_CONFLICT' ? [{ label: t('common.actions.reload'), color: 'neutral', variant: 'outline', onClick: () => { save.reset(); items.refresh() } }] : []"
          />
          <UPageCard variant="subtle">
            <UFormField
              :label="t('pricing.serviceType')"
              name="serviceTypeId"
              required
            >
              <USelect
                v-model="state.serviceTypeId"
                :items="typeOptions"
                :placeholder="t('pricing.chooseServiceType')"
                class="w-full"
              />
            </UFormField>
            <UFormField
              :label="t('pricing.nameEn')"
              name="nameEn"
              required
            >
              <UInput
                v-model="state.nameEn"
                class="w-full"
              />
            </UFormField>
            <UFormField
              :label="t('pricing.nameKm')"
              name="nameKm"
            >
              <UInput
                v-model="state.nameKm"
                lang="km"
                class="w-full"
              />
            </UFormField>
            <UFormField
              :label="t('pricing.unit')"
              name="unit"
              required
            >
              <URadioGroup
                v-model="state.unit"
                :items="unitOptions"
                orientation="horizontal"
              />
            </UFormField>
            <UFormField
              :label="priceLabel"
              :help="record ? t('pricing.priceChangeHelp') : undefined"
              name="price"
              required
            >
              <UInput
                v-model="state.price"
                :inputmode="currency === 'KHR' ? 'numeric' : 'decimal'"
                autocomplete="off"
                class="w-full sm:w-56"
              />
            </UFormField>
          </UPageCard>
          <div class="flex flex-wrap justify-between gap-3">
            <UButton
              v-if="record"
              :label="t('pricing.archive')"
              icon="i-lucide-archive"
              color="error"
              variant="ghost"
              @click="confirming = true"
            />
            <UButton
              type="submit"
              :label="id ? t('common.actions.save') : t('pricing.create')"
              :loading="save.pending.value"
              :disabled="Boolean(id) && !dirty"
              class="ms-auto"
            />
          </div>
        </UForm>
      </div>

      <UModal
        :open="confirming"
        :title="t('pricing.archiveItemConfirm', { name: record?.nameEn })"
        :description="t('pricing.archiveItemDescription')"
        :dismissible="!archive.pending.value"
        @update:open="open => { confirming = open }"
      >
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton
              :label="t('common.actions.cancel')"
              color="neutral"
              variant="ghost"
              :disabled="archive.pending.value"
              @click="confirming = false"
            />
            <UButton
              :label="t('pricing.archive')"
              color="error"
              :loading="archive.pending.value"
              @click="onArchive()"
            />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
