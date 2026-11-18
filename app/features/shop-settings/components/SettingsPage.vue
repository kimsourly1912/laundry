<script setup lang="ts">
/**
 * Shop settings (spec §3 → settings pattern): name, contact, currency.
 * Orders keep a copy of these details when saved (D33). One form, saved at the version it opened with.
 */
import type { FormSubmitEvent } from '@nuxt/ui'
import type { ShopSettings } from '#shared/contracts/shop-settings'
import { CURRENCIES } from '#shared/contracts/shop-settings'
import { useShopSettings } from '../composables/useShopSettings'
import type { SettingsForm } from '../schemas/settings-form'
import { settingsFormSchema, toSettingsForm, toSettingsRequest } from '../schemas/settings-form'

const { t, te } = useI18n()
const { can } = useSession()
const settings = useShopSettings()
const schema = computed(() => settingsFormSchema(t))
const state = reactive<SettingsForm>({ name: '', phone: '', address: '', currency: 'KHR' })
const baseline = ref('')
const form = useTemplateRef('form')
useFormErrorRecheck(form)

// The form follows the saved settings: when loaded, and after each save (its new version).
watch(() => settings.data.value, (value) => {
  if (!value) return
  Object.assign(state, toSettingsForm(value))
  baseline.value = JSON.stringify(state)
}, { immediate: true })
const dirty = computed(() => settings.data.value != null && JSON.stringify(state) !== baseline.value)

const save = useMutation((body: SettingsForm) => apiFetch<ShopSettings>('/shop/settings', { method: 'PATCH', body: toSettingsRequest(body, settings.data.value!.version) }), {
  inline: true,
  invalidate: ['shop-settings'],
  success: () => t('settings.saved'),
})
useUnsavedChanges(() => dirty.value && !save.pending.value)
const failure = computed(() => (save.error.value && !save.error.value.fieldErrors ? errorText(save.error.value, t, te) : undefined))
const conflict = computed(() => save.error.value?.code === 'VERSION_CONFLICT')

async function onSubmit(event: FormSubmitEvent<SettingsForm>) {
  const result = await save.execute(event.data)
  if (!result.ok && result.error.fieldErrors) {
    form.value?.setErrors(formErrors(result.error.fieldErrors).map(error => ({ ...error, message: te(`errors.code.${result.error.code}`) ? t(`errors.code.${result.error.code}`) : error.message })))
  }
}

/** Reload after a conflict: the newer settings, then the person's own changes again on top. */
async function reload() {
  const mine = { ...state }
  await settings.refresh()
  Object.assign(state, mine)
  save.reset()
}

const currencies = computed(() => CURRENCIES.map(code => ({ label: t(`settings.currencies.${code}`), value: code })))
const readOnly = computed(() => !can('shop:update'))
</script>

<template>
  <UDashboardPanel id="settings">
    <template #header>
      <UDashboardNavbar :title="t('settings.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-page">
        <PageLoadError
          v-if="settings.error.value && !settings.data.value"
          :error="settings.error.value"
          @retry="settings.refresh()"
        />
        <div
          v-else-if="settings.loading.value"
          class="space-y-4"
        >
          <USkeleton
            v-for="n in 3"
            :key="n"
            class="h-32 w-full"
          />
        </div>
        <UForm
          v-else
          ref="form"
          :schema="schema"
          :state="state"
          :validate-on="['input', 'change']"
          :disabled="save.pending.value || readOnly"
          class="space-y-6"
          @submit="onSubmit"
          @error="focusFirstError"
        >
          <UAlert
            v-if="conflict"
            color="warning"
            variant="subtle"
            icon="i-lucide-refresh-cw"
            :title="t('errors.code.VERSION_CONFLICT')"
            :actions="[{ label: t('common.actions.reload'), color: 'neutral', variant: 'outline', onClick: reload }]"
          />
          <UAlert
            v-else-if="failure"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="failure"
            role="alert"
          />

          <UPageCard
            :title="t('settings.shopSection')"
            variant="subtle"
          >
            <UFormField
              :label="t('settings.name')"
              name="name"
              required
            >
              <UInput
                v-model="state.name"
                class="w-full"
              />
            </UFormField>
            <UFormField
              :label="t('settings.phone')"
              :help="t('settings.phoneHelp')"
              name="phone"
            >
              <UInput
                v-model="state.phone"
                type="tel"
                inputmode="tel"
                class="w-full"
              />
            </UFormField>
            <UFormField
              :label="t('settings.address')"
              name="address"
            >
              <UInput
                v-model="state.address"
                class="w-full"
              />
            </UFormField>
          </UPageCard>

          <UPageCard
            :title="t('settings.pricesSection')"
            variant="subtle"
          >
            <UFormField
              :label="t('settings.currency')"
              :help="t('settings.currencyHelp')"
              name="currency"
            >
              <USelect
                v-model="state.currency"
                :items="currencies"
                class="w-full sm:w-56"
              />
            </UFormField>
          </UPageCard>

          <div
            v-if="!readOnly"
            class="flex justify-end"
          >
            <UButton
              type="submit"
              :label="t('common.actions.save')"
              :loading="save.pending.value"
              :disabled="!dirty"
            />
          </div>
        </UForm>
      </div>
    </template>
  </UDashboardPanel>
</template>
