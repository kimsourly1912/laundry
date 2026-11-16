<script setup lang="ts">
/** A service type: new, or edit and archive (spec §4 → Price list). Saved at the version opened. */
import type { FormSubmitEvent } from '@nuxt/ui'
import type { ServiceType } from '#shared/contracts/pricing'
import { usePriceScope, useServiceTypes } from '../composables/usePriceList'
import type { ServiceTypeForm } from '../schemas/price-form'
import { serviceTypeFormSchema, toServiceTypeForm, toServiceTypeRequest } from '../schemas/price-form'

const props = defineProps<{ id?: string }>()
const { t, te } = useI18n()
const scope = usePriceScope()
const types = useServiceTypes('active')
const record = computed(() => (props.id ? types.data.value?.items.find(type => type.id === props.id) : undefined))
const missing = computed(() => Boolean(props.id && types.data.value && !record.value))

const schema = computed(() => serviceTypeFormSchema(t))
const state = reactive<ServiceTypeForm>(toServiceTypeForm())
const baseline = ref(JSON.stringify(state))
const form = useTemplateRef('form')
useFormErrorRecheck(form)
watch(record, (value) => {
  if (!value) return
  Object.assign(state, toServiceTypeForm(value))
  baseline.value = JSON.stringify(state)
}, { immediate: true })
const dirty = computed(() => JSON.stringify(state) !== baseline.value)

const save = useMutation((body: ServiceTypeForm) => (record.value
  ? apiFetch<ServiceType>(`${scope.api}/service-types/${record.value.id}`, { method: 'PATCH', body: { ...toServiceTypeRequest(body), version: record.value.version } })
  : apiFetch<ServiceType>(`${scope.api}/service-types`, { method: 'POST', body: toServiceTypeRequest(body) })), {
  inline: true,
  invalidate: ['pricing'],
  success: () => t('pricing.saved'),
})
const archive = useMutation(() => apiFetch<ServiceType>(`${scope.api}/service-types/${record.value!.id}`, { method: 'DELETE', query: { version: record.value!.version } }), {
  invalidate: ['pricing'],
  success: () => t('pricing.archivedDone'),
})
useUnsavedChanges(() => dirty.value && !save.pending.value)
const failure = computed(() => (save.error.value ? errorText(save.error.value, t, te) : undefined))
const confirming = ref(false)

async function onSubmit(event: FormSubmitEvent<ServiceTypeForm>) {
  const result = await save.execute(event.data)
  if (!result.ok) return
  baseline.value = JSON.stringify(state)
  await navigateTo(scope.pages)
}

async function onArchive() {
  const result = await archive.execute(undefined)
  confirming.value = false
  if (result.ok) await navigateTo(scope.pages)
}
</script>

<template>
  <UDashboardPanel id="service-type">
    <template #header>
      <UDashboardNavbar :title="id ? t('pricing.editServiceType') : t('pricing.newServiceType')">
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
      <div class="mx-auto w-full max-w-page space-y-6">
        <UEmpty
          v-if="missing"
          icon="i-lucide-tags"
          :title="t('pricing.notFound')"
          :actions="[{ label: t('pricing.back'), color: 'neutral', variant: 'outline', to: scope.pages }]"
        />
        <PageLoadError
          v-else-if="types.error.value && !types.data.value"
          :error="types.error.value"
          @retry="types.refresh()"
        />
        <USkeleton
          v-else-if="id && !record"
          class="h-40 w-full"
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
            :actions="save.error.value?.code === 'VERSION_CONFLICT' ? [{ label: t('common.actions.reload'), color: 'neutral', variant: 'outline', onClick: () => { save.reset(); types.refresh() } }] : []"
          />
          <UPageCard variant="subtle">
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
        :title="t('pricing.archiveServiceTypeConfirm', { name: record?.nameEn })"
        :description="t('pricing.archiveServiceTypeDescription')"
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
