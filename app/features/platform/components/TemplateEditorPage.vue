<script setup lang="ts">
/**
 * A slip template (D25), new or saved: its services (the columns), its clothing items (the rows),
 * in the order the shop's paper slip has them, and a price for each item in each service it's
 * offered in. Saved whole, at the version read. Shops made from it keep their own copy.
 */
import type { FormSubmitEvent } from '@nuxt/ui'
import type { Template } from '#shared/contracts/templates'
import { PRICE_UNITS } from '#shared/contracts/pricing'
import { CURRENCIES } from '#shared/contracts/shop-settings'
import type { TemplateForm } from '../schemas/template-form'
import { MAX_TEMPLATE_ITEMS, MAX_TEMPLATE_SERVICES, move, newKey, priceKey, starterTemplateForm, templateFormErrors, toTemplateForm, toTemplateRequest } from '../schemas/template-form'

const props = defineProps<{ id?: string }>()
const { t, te } = useI18n()
const { can } = useSession()
const editable = computed(() => can('template:write'))

const loaded = props.id
  ? useApiQuery(() => `platform:templates:one:${props.id}`, () => apiFetch<Template>(`/platform/templates/${props.id}`))
  : undefined
const record = computed(() => loaded?.data.value)
const archived = computed(() => record.value?.status === 'archived')

const state = reactive<TemplateForm>(starterTemplateForm())
const baseline = ref(props.id ? '' : JSON.stringify(state))
watch(record, (template) => {
  if (!template) return
  Object.assign(state, toTemplateForm(template))
  baseline.value = JSON.stringify(state)
}, { immediate: true })
const dirty = computed(() => baseline.value !== '' && JSON.stringify(state) !== baseline.value)

const form = useTemplateRef('form')
useFormErrorRecheck(form)
function validate() {
  return templateFormErrors(state, t)
}

const save = useMutation((body: TemplateForm) => (record.value
  ? apiFetch<Template>(`/platform/templates/${record.value.id}`, { method: 'PATCH', body: { ...toTemplateRequest(body), version: record.value.version } })
  : apiFetch<Template>('/platform/templates', { method: 'POST', body: toTemplateRequest(body) })), {
  inline: true,
  invalidate: ['platform'],
  success: () => t('platform.templates.saved'),
})
const changeStatus = useMutation((action: 'archive' | 'restore') => apiFetch<Template>(`/platform/templates/${record.value!.id}/${action}`, { method: 'POST', body: { version: record.value!.version } }), {
  invalidate: ['platform'],
  success: (template: Template) => t(template.status === 'archived' ? 'platform.templates.archivedDone' : 'platform.templates.restoredDone'),
})
useUnsavedChanges(() => dirty.value && !save.pending.value)
const failure = computed(() => (save.error.value && !save.error.value.fieldErrors ? errorText(save.error.value, t, te) : undefined))
const confirming = ref(false)

async function onSubmit(event: FormSubmitEvent<TemplateForm>) {
  const result = await save.execute(event.data)
  if (result.ok) {
    baseline.value = JSON.stringify(state)
    return navigateTo('/platform/templates')
  }
  if (result.error.fieldErrors) {
    form.value?.setErrors(formErrors(result.error.fieldErrors).map(error => ({ ...error, message: te(`errors.code.${result.error.code}`) ? t(`errors.code.${result.error.code}`) : error.message })))
  }
}

async function onStatus(action: 'archive' | 'restore') {
  const result = await changeStatus.execute(action)
  confirming.value = false
  if (result.ok) await navigateTo('/platform/templates')
}

function addService() {
  state.services.push({ key: newKey(), nameEn: '', nameKm: '' })
  nextTick(() => document.getElementById(`service-${state.services.length - 1}-en`)?.focus())
}
function addItem() {
  state.items.push({ key: newKey(), nameEn: '', nameKm: '', unit: 'piece' })
  nextTick(() => document.getElementById(`item-${state.items.length - 1}-en`)?.focus())
}

const currencyOptions = computed(() => CURRENCIES.map(currency => ({ label: t(`settings.currencies.${currency}`), value: currency })))
const unitOptions = computed(() => PRICE_UNITS.map(unit => ({ label: t(`pricing.unitChoices.${unit}`), value: unit })))
const title = computed(() => (props.id ? record.value?.name ?? t('platform.templates.title') : t('platform.templates.new')))
const rowLabel = (name: string, index: number) => name.trim() || t('platform.templates.unnamed', { n: index + 1 })
</script>

<template>
  <UDashboardPanel id="platform-template">
    <template #header>
      <UDashboardNavbar :title="title">
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            :aria-label="t('platform.templates.back')"
            to="/platform/templates"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UEmpty
        v-if="loaded?.error.value?.kind === 'not_found'"
        icon="i-lucide-layout-template"
        :title="t('platform.templates.notFound')"
        :actions="[{ label: t('platform.templates.back'), to: '/platform/templates', color: 'neutral', variant: 'outline' }]"
      />
      <PageLoadError
        v-else-if="loaded?.error.value && !record"
        :error="loaded.error.value"
        @retry="loaded.refresh()"
      />
      <div
        v-else-if="id && !record"
        class="space-y-2"
      >
        <USkeleton
          v-for="n in 4"
          :key="n"
          class="h-20 w-full"
        />
      </div>
      <UForm
        v-else
        ref="form"
        :state="state"
        :validate="validate"
        :validate-on="['input', 'change']"
        :disabled="save.pending.value || archived || !editable"
        class="mx-auto w-full max-w-4xl space-y-6"
        @submit="onSubmit"
        @error="focusFirstError"
      >
        <p class="text-sm text-muted">
          {{ t('platform.templates.description') }}
        </p>
        <UAlert
          v-if="archived"
          color="warning"
          variant="subtle"
          icon="i-lucide-archive"
          :title="t('platform.templates.archivedNotice')"
        />
        <UAlert
          v-if="failure"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="failure"
          role="alert"
        />

        <UPageCard variant="subtle">
          <div class="grid gap-4 sm:grid-cols-[1fr_12rem]">
            <UFormField
              :label="t('platform.templates.name')"
              name="name"
              required
            >
              <UInput
                v-model="state.name"
                class="w-full"
              />
            </UFormField>
            <UFormField
              :label="t('platform.templates.currency')"
              :help="t('platform.templates.currencyHelp')"
              name="currency"
            >
              <USelect
                v-model="state.currency"
                :items="currencyOptions"
                class="w-full"
              />
            </UFormField>
          </div>
        </UPageCard>

        <UPageCard
          :title="t('platform.templates.services')"
          :description="t('platform.templates.servicesHelp')"
          variant="subtle"
        >
          <UFormField name="services">
            <ul class="space-y-3">
              <li
                v-for="(service, index) in state.services"
                :key="service.key"
                class="flex flex-wrap items-start gap-2"
              >
                <UFormField
                  :name="`services.${index}.nameEn`"
                  class="min-w-40 flex-1"
                >
                  <UInput
                    :id="`service-${index}-en`"
                    v-model="service.nameEn"
                    :placeholder="t('platform.templates.nameEn')"
                    :aria-label="t('platform.templates.serviceNameEn', { n: index + 1 })"
                    class="w-full"
                  />
                </UFormField>
                <UInput
                  v-model="service.nameKm"
                  :placeholder="t('platform.templates.nameKm')"
                  :aria-label="t('platform.templates.serviceNameKm', { n: index + 1 })"
                  class="min-w-40 flex-1"
                />
                <div class="flex">
                  <UButton
                    icon="i-lucide-arrow-up"
                    color="neutral"
                    variant="ghost"
                    :aria-label="t('platform.templates.moveUp', { name: rowLabel(service.nameEn, index) })"
                    :disabled="index === 0"
                    @click="move(state.services, index, -1)"
                  />
                  <UButton
                    icon="i-lucide-arrow-down"
                    color="neutral"
                    variant="ghost"
                    :aria-label="t('platform.templates.moveDown', { name: rowLabel(service.nameEn, index) })"
                    :disabled="index === state.services.length - 1"
                    @click="move(state.services, index, 1)"
                  />
                  <UButton
                    icon="i-lucide-x"
                    color="neutral"
                    variant="ghost"
                    :aria-label="t('platform.templates.remove', { name: rowLabel(service.nameEn, index) })"
                    @click="state.services.splice(index, 1)"
                  />
                </div>
              </li>
            </ul>
          </UFormField>
          <div>
            <UButton
              v-if="state.services.length < MAX_TEMPLATE_SERVICES"
              :label="t('platform.templates.addService')"
              icon="i-lucide-plus"
              color="neutral"
              variant="outline"
              @click="addService"
            />
          </div>
        </UPageCard>

        <UPageCard
          :title="t('platform.templates.items')"
          :description="t('platform.templates.itemsHelp')"
          variant="subtle"
        >
          <UFormField name="items">
            <ul class="space-y-3">
              <li
                v-for="(item, index) in state.items"
                :key="item.key"
                class="flex flex-wrap items-start gap-2"
              >
                <UFormField
                  :name="`items.${index}.nameEn`"
                  class="min-w-40 flex-1"
                >
                  <UInput
                    :id="`item-${index}-en`"
                    v-model="item.nameEn"
                    :placeholder="t('platform.templates.nameEn')"
                    :aria-label="t('platform.templates.itemNameEn', { n: index + 1 })"
                    class="w-full"
                  />
                </UFormField>
                <UInput
                  v-model="item.nameKm"
                  :placeholder="t('platform.templates.nameKm')"
                  :aria-label="t('platform.templates.itemNameKm', { n: index + 1 })"
                  class="min-w-40 flex-1"
                />
                <USelect
                  v-model="item.unit"
                  :items="unitOptions"
                  :aria-label="t('platform.templates.unit', { name: rowLabel(item.nameEn, index) })"
                  class="w-32"
                />
                <div class="flex">
                  <UButton
                    icon="i-lucide-arrow-up"
                    color="neutral"
                    variant="ghost"
                    :aria-label="t('platform.templates.moveUp', { name: rowLabel(item.nameEn, index) })"
                    :disabled="index === 0"
                    @click="move(state.items, index, -1)"
                  />
                  <UButton
                    icon="i-lucide-arrow-down"
                    color="neutral"
                    variant="ghost"
                    :aria-label="t('platform.templates.moveDown', { name: rowLabel(item.nameEn, index) })"
                    :disabled="index === state.items.length - 1"
                    @click="move(state.items, index, 1)"
                  />
                  <UButton
                    icon="i-lucide-x"
                    color="neutral"
                    variant="ghost"
                    :aria-label="t('platform.templates.remove', { name: rowLabel(item.nameEn, index) })"
                    @click="state.items.splice(index, 1)"
                  />
                </div>
              </li>
            </ul>
          </UFormField>
          <div>
            <UButton
              v-if="state.items.length < MAX_TEMPLATE_ITEMS"
              :label="t('platform.templates.addItem')"
              icon="i-lucide-plus"
              color="neutral"
              variant="outline"
              @click="addItem"
            />
          </div>
        </UPageCard>

        <UPageCard
          :title="t('platform.templates.prices')"
          :description="t('platform.templates.pricesHelp', { currency: t(`settings.currencies.${state.currency}`) })"
          variant="subtle"
        >
          <UFormField name="prices">
            <!-- Wide grids scroll inside their card, never the page (responsive-layout). -->
            <div class="overflow-x-auto">
              <table class="w-full border-separate border-spacing-1 text-sm">
                <thead>
                  <tr>
                    <th
                      scope="col"
                      class="min-w-32 text-start font-medium text-muted"
                    >
                      {{ t('platform.templates.item') }}
                    </th>
                    <th
                      v-for="(service, column) in state.services"
                      :key="service.key"
                      scope="col"
                      class="min-w-28 text-start font-medium"
                    >
                      {{ rowLabel(service.nameEn, column) }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(item, row) in state.items"
                    :key="item.key"
                  >
                    <th
                      scope="row"
                      class="text-start font-normal"
                    >
                      {{ rowLabel(item.nameEn, row) }}
                      <span class="text-xs text-muted">/ {{ t(`orders.unit.${item.unit}`) }}</span>
                    </th>
                    <td
                      v-for="(service, column) in state.services"
                      :key="service.key"
                    >
                      <UFormField :name="`prices.${priceKey(service.key, item.key)}`">
                        <UInput
                          v-model="state.prices[priceKey(service.key, item.key)]"
                          :inputmode="state.currency === 'KHR' ? 'numeric' : 'decimal'"
                          autocomplete="off"
                          placeholder="—"
                          :aria-label="t('platform.templates.priceOf', { item: rowLabel(item.nameEn, row), service: rowLabel(service.nameEn, column) })"
                          class="w-full"
                        />
                      </UFormField>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </UFormField>
        </UPageCard>

        <div
          v-if="editable"
          class="flex flex-wrap items-center justify-between gap-2"
        >
          <div>
            <UButton
              v-if="record && !archived"
              :label="t('platform.templates.archive')"
              icon="i-lucide-archive"
              color="neutral"
              variant="outline"
              @click="confirming = true"
            />
            <UButton
              v-if="archived"
              :label="t('platform.templates.restore')"
              icon="i-lucide-archive-restore"
              color="neutral"
              variant="outline"
              :loading="changeStatus.pending.value"
              @click="onStatus('restore')"
            />
          </div>
          <UButton
            v-if="!archived"
            type="submit"
            :label="t('common.actions.save')"
            :loading="save.pending.value"
          />
        </div>
      </UForm>

      <UModal
        :open="confirming"
        :title="t('platform.templates.archiveConfirm', { name: record?.name })"
        :description="t('platform.templates.archiveDescription')"
        :dismissible="!changeStatus.pending.value"
        @update:open="open => { confirming = open }"
      >
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton
              :label="t('common.actions.cancel')"
              color="neutral"
              variant="ghost"
              :disabled="changeStatus.pending.value"
              @click="confirming = false"
            />
            <UButton
              :label="t('platform.templates.archive')"
              :loading="changeStatus.pending.value"
              @click="onStatus('archive')"
            />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
