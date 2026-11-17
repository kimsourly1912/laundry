<script setup lang="ts">
/** New shop + owner (spec §4 task flow): saved together or not at all; then the shop's page. */
import type { FormSubmitEvent } from '@nuxt/ui'
import type { Page } from '#shared/contracts/common'
import type { PlatformShop } from '#shared/contracts/platform-shops'
import type { TemplateSummary } from '#shared/contracts/templates'
import { MIN_PASSWORD_LENGTH } from '#shared/contracts/identity'
import type { NewShopForm } from '../schemas/shop-form'
import { emptyNewShopForm, newShopFormSchema, slugFromName, toCreateShopRequest } from '../schemas/shop-form'

const { t, te } = useI18n()
const schema = computed(() => newShopFormSchema(t))
const state = reactive<NewShopForm>(emptyNewShopForm())
const form = useTemplateRef('form')
useFormErrorRecheck(form)

// The short name follows the shop's name until it's typed by hand.
const slugEdited = ref(false)
watch(() => state.name, (name) => {
  if (!slugEdited.value) state.slug = slugFromName(name)
})

const create = useMutation((body: NewShopForm) => apiFetch<PlatformShop>('/platform/shops', { method: 'POST', body: toCreateShopRequest(body) }), {
  inline: true,
  invalidate: ['platform'],
  success: shop => t('platform.newShop.created', { shop: shop.name }),
})
const failure = computed(() => (create.error.value && !create.error.value.fieldErrors ? errorText(create.error.value, t, te) : undefined))

// A shop with no template can't take orders (D31): the platform picks one now, or on the shop's page.
const published = useApiQuery('platform:published-templates', () => apiFetch<Page<TemplateSummary>>('/platform/templates', { query: { status: 'published', pageSize: 100 } }))
const templateItems = computed(() => (published.data.value?.items ?? []).map(item => ({ value: item.id, label: item.name })))
const templateId = ref<string>()
const attach = useMutation((input: { templateId: string, shopId: string }) => apiFetch(`/platform/templates/${input.templateId}/shops`, { method: 'POST', body: { shopId: input.shopId } }))

async function onSubmit(event: FormSubmitEvent<NewShopForm>) {
  const result = await create.execute(event.data)
  if (result.ok) {
    // A second request: if it fails, its toast says so and the shop's page offers it again.
    if (templateId.value) await attach.execute({ templateId: templateId.value, shopId: result.data.id })
    return navigateTo(`/platform/shops/${result.data.id}`)
  }
  // A taken username or short name: on its field, until that field changes.
  if (result.error.fieldErrors) {
    form.value?.setErrors(formErrors(result.error.fieldErrors).map(error => ({ ...error, message: te(`errors.code.${result.error.code}`) ? t(`errors.code.${result.error.code}`) : error.message })))
  }
}
</script>

<template>
  <UDashboardPanel id="platform-new-shop">
    <template #header>
      <UDashboardNavbar :title="t('platform.newShop.title')">
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            :aria-label="t('common.actions.back')"
            to="/platform/shops"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UForm
        ref="form"
        :schema="schema"
        :state="state"
        :validate-on="['input', 'change']"
        :disabled="create.pending.value"
        class="mx-auto w-full max-w-xl space-y-6"
        @submit="onSubmit"
        @error="focusFirstError"
      >
        <p class="text-sm text-muted">
          {{ t('platform.newShop.description') }}
        </p>
        <UAlert
          v-if="failure"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="failure"
          role="alert"
        />

        <UPageCard
          :title="t('platform.newShop.shopSection')"
          variant="subtle"
        >
          <UFormField
            :label="t('platform.newShop.name')"
            name="name"
            required
          >
            <UInput
              v-model="state.name"
              class="w-full"
            />
          </UFormField>
          <UFormField
            :label="t('platform.newShop.slug')"
            :help="t('platform.newShop.slugHint')"
            name="slug"
            required
          >
            <UInput
              v-model="state.slug"
              autocapitalize="none"
              spellcheck="false"
              class="w-full"
              @update:model-value="slugEdited = true"
            />
          </UFormField>
          <UFormField
            :label="t('platform.newShop.template')"
            :hint="t('common.optional')"
            :help="templateItems.length ? t('platform.newShop.templateHelp') : t('platform.newShop.noTemplates')"
          >
            <USelect
              v-model="templateId"
              :items="templateItems"
              :placeholder="t('platform.shop.templates.choose')"
              :disabled="!templateItems.length"
              class="w-full"
            />
          </UFormField>
        </UPageCard>

        <UPageCard
          :title="t('platform.newShop.ownerSection')"
          variant="subtle"
        >
          <UFormField
            :label="t('platform.newShop.ownerName')"
            name="owner.name"
            required
          >
            <UInput
              v-model="state.owner.name"
              class="w-full"
            />
          </UFormField>
          <UFormField
            :label="t('platform.newShop.username')"
            name="owner.username"
            required
          >
            <UInput
              v-model="state.owner.username"
              autocomplete="off"
              autocapitalize="none"
              spellcheck="false"
              class="w-full"
            />
          </UFormField>
          <UFormField
            :label="t('platform.newShop.password')"
            :hint="t('account.changePassword.hint', { min: MIN_PASSWORD_LENGTH })"
            name="owner.password"
            required
          >
            <UInput
              v-model="state.owner.password"
              autocomplete="new-password"
              autocapitalize="none"
              spellcheck="false"
              class="w-full"
            />
          </UFormField>
        </UPageCard>

        <div class="flex justify-end">
          <UButton
            type="submit"
            :label="t('platform.newShop.submit')"
            :loading="create.pending.value"
          />
        </div>
      </UForm>
    </template>
  </UDashboardPanel>
</template>
