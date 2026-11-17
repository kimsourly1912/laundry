<script setup lang="ts">
/**
 * One shop, as the platform sees it (spec §4 → settings pattern): profile and rename, the owner
 * (reset password, sign out everywhere), suspend or resume. Each change sends the version shown.
 * Its templates: attach and detach them (plan step 2).
 */
import type { FormSubmitEvent } from '@nuxt/ui'
import type { PlatformShopDetail } from '#shared/contracts/platform-shops'
import { MIN_PASSWORD_LENGTH } from '#shared/contracts/identity'
import * as v from 'valibot'
import { shopNameFormSchema, temporaryPasswordFormSchema } from '../schemas/shop-form'
import ShopTemplatesCard from './ShopTemplatesCard.vue'

const props = defineProps<{ id: string }>()
const { t, locale } = useI18n()
const { can } = useSession()
const shop = useApiQuery(() => `platform:shop:${props.id}`, () => apiFetch<PlatformShopDetail>(`/platform/shops/${props.id}`))
const current = computed(() => shop.data.value)
const missing = computed(() => shop.error.value?.kind === 'not_found')

// --- Rename ---
const renameSchema = computed(() => v.object({ name: shopNameFormSchema(t) }))
const renameState = reactive({ name: '' })
const renameForm = useTemplateRef('renameForm')
useFormErrorRecheck(renameForm)
watch(current, (value) => {
  if (value) renameState.name = value.name
}, { immediate: true })
const renameDirty = computed(() => current.value != null && renameState.name.trim() !== current.value.name)
const rename = useMutation((name: string) => apiFetch<PlatformShopDetail>(`/platform/shops/${props.id}`, { method: 'PATCH', body: { version: current.value!.version, name } }), {
  invalidate: ['platform'],
  success: () => t('platform.shop.renamed'),
})
function onRename(event: FormSubmitEvent<{ name: string }>) {
  return rename.execute(event.data.name)
}

// --- Owner: reset password ---
const resetSchema = computed(() => v.object({ password: temporaryPasswordFormSchema(t) }))
const resetState = reactive({ password: '' })
const resetForm = useTemplateRef('resetForm')
useFormErrorRecheck(resetForm)
const reset = useMutation((password: string) => apiFetch(`/platform/shops/${props.id}/owner/reset-password`, { method: 'POST', body: { password } }), {
  invalidate: ['platform'],
  success: () => t('platform.shop.passwordReset'),
})
async function onReset(event: FormSubmitEvent<{ password: string }>) {
  const result = await reset.execute(event.data.password)
  if (result.ok) {
    resetState.password = ''
    resetForm.value?.clear()
  }
}

// --- Owner: sign out everywhere, and suspend / resume: confirmed first ---
const confirming = ref<'revoke' | 'suspend' | null>(null)
const revoke = useMutation(() => apiFetch(`/platform/shops/${props.id}/owner/revoke-sessions`, { method: 'POST', body: {} }), {
  success: () => t('platform.shop.sessionsRevoked'),
})
const setStatus = useMutation((action: 'suspend' | 'resume') => apiFetch<PlatformShopDetail>(`/platform/shops/${props.id}/${action}`, { method: 'POST', body: { version: current.value!.version } }), {
  invalidate: ['platform'],
  success: shop => t(shop.status === 'suspended' ? 'platform.shop.suspended' : 'platform.shop.resumed'),
})
async function confirm() {
  const action = confirming.value
  const result = action === 'revoke' ? await revoke.execute(undefined) : await setStatus.execute('suspend')
  if (result.ok || result.error.kind === 'conflict') confirming.value = null
}
const confirmText = computed(() => (confirming.value === 'revoke' ? t('platform.shop.revokeSessionsConfirm') : t('platform.shop.suspendConfirm', { shop: current.value?.name })))
const confirmLabel = computed(() => (confirming.value === 'revoke' ? t('platform.shop.revokeSessions') : t('platform.shop.suspend')))
const conflict = computed(() => [rename.error.value, setStatus.error.value].some(error => error?.code === 'VERSION_CONFLICT'))
</script>

<template>
  <UDashboardPanel id="platform-shop">
    <template #header>
      <UDashboardNavbar :title="current?.name ?? t('platform.shop.title')">
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            :aria-label="t('platform.shop.back')"
            to="/platform/shops"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-2xl space-y-6">
        <UEmpty
          v-if="missing"
          icon="i-lucide-store"
          :title="t('platform.shop.notFound')"
          :actions="[{ label: t('platform.shop.back'), color: 'neutral', variant: 'outline', to: '/platform/shops' }]"
        />
        <PageLoadError
          v-else-if="shop.error.value && !current"
          :error="shop.error.value"
          @retry="shop.refresh()"
        />
        <div
          v-else-if="!current"
          class="space-y-4"
        >
          <USkeleton
            v-for="n in 3"
            :key="n"
            class="h-32 w-full"
          />
        </div>
        <template v-else>
          <UAlert
            v-if="conflict"
            color="warning"
            variant="subtle"
            icon="i-lucide-refresh-cw"
            :title="t('errors.code.VERSION_CONFLICT')"
            :actions="[{ label: t('common.actions.reload'), color: 'neutral', variant: 'outline', onClick: () => shop.refresh() }]"
          />

          <UPageCard
            :title="t('platform.shop.profile')"
            variant="subtle"
          >
            <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt class="text-muted">
                {{ t('platform.shop.slug') }}
              </dt>
              <dd class="break-words">
                {{ current.slug }}
              </dd>
              <dt class="text-muted">
                {{ t('platform.shop.createdAt') }}
              </dt>
              <dd>{{ formatDate(current.createdAt, locale) }}</dd>
              <dt class="text-muted">
                {{ t('platform.shop.status') }}
              </dt>
              <dd>
                <UBadge
                  :label="t(`platform.status.${current.status}`)"
                  :color="current.status === 'active' ? 'success' : 'warning'"
                  variant="subtle"
                />
              </dd>
            </dl>
            <UForm
              v-if="can('shop:update')"
              ref="renameForm"
              :schema="renameSchema"
              :state="renameState"
              :validate-on="['input', 'change']"
              :disabled="rename.pending.value"
              class="flex flex-col gap-3 sm:flex-row sm:items-start"
              @submit="onRename"
              @error="focusFirstError"
            >
              <UFormField
                :label="t('platform.newShop.name')"
                name="name"
                class="flex-1"
              >
                <UInput
                  v-model="renameState.name"
                  class="w-full"
                />
              </UFormField>
              <UButton
                type="submit"
                :label="t('platform.shop.rename')"
                :loading="rename.pending.value"
                :disabled="!renameDirty"
                color="neutral"
                variant="outline"
                class="sm:mt-6"
              />
            </UForm>
          </UPageCard>

          <UPageCard
            :title="t('platform.shop.owner')"
            variant="subtle"
          >
            <dl
              v-if="current.owner"
              class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm"
            >
              <dt class="text-muted">
                {{ t('platform.shop.ownerName') }}
              </dt>
              <dd class="break-words">
                {{ current.owner.name }}
              </dd>
              <dt class="text-muted">
                {{ t('platform.shop.username') }}
              </dt>
              <dd class="break-words">
                {{ current.owner.username }}
                <UBadge
                  v-if="current.owner.mustChangePassword"
                  :label="t('platform.shop.temporaryPassword')"
                  color="neutral"
                  variant="subtle"
                  class="ms-2"
                />
              </dd>
            </dl>
            <p
              v-else
              class="text-sm text-muted"
            >
              {{ t('platform.shops.noOwner') }}
            </p>

            <template v-if="current.owner && can('owner:reset-password')">
              <USeparator />
              <p class="text-sm text-muted">
                {{ t('platform.shop.resetPasswordDescription') }}
              </p>
              <UForm
                ref="resetForm"
                :schema="resetSchema"
                :state="resetState"
                :validate-on="['input', 'change']"
                :disabled="reset.pending.value"
                class="flex flex-col gap-3 sm:flex-row sm:items-start"
                @submit="onReset"
                @error="focusFirstError"
              >
                <UFormField
                  :label="t('platform.newShop.password')"
                  :hint="t('account.changePassword.hint', { min: MIN_PASSWORD_LENGTH })"
                  name="password"
                  class="flex-1"
                >
                  <UInput
                    v-model="resetState.password"
                    autocomplete="new-password"
                    autocapitalize="none"
                    spellcheck="false"
                    class="w-full"
                  />
                </UFormField>
                <UButton
                  type="submit"
                  :label="t('platform.shop.resetPassword')"
                  :loading="reset.pending.value"
                  color="neutral"
                  variant="outline"
                  class="sm:mt-6"
                />
              </UForm>
            </template>

            <template v-if="current.owner && can('owner:revoke-sessions')">
              <USeparator />
              <p class="text-sm text-muted">
                {{ t('platform.shop.revokeSessionsDescription') }}
              </p>
              <UButton
                :label="t('platform.shop.revokeSessions')"
                icon="i-lucide-log-out"
                color="neutral"
                variant="outline"
                class="self-start"
                @click="confirming = 'revoke'"
              />
            </template>
          </UPageCard>

          <ShopTemplatesCard
            v-if="can('template:read')"
            :shop-id="current.id"
          />

          <UPageCard
            v-if="can('shop:suspend')"
            :title="t('platform.shop.status')"
            variant="subtle"
          >
            <p class="text-sm text-muted">
              {{ current.status === 'active' ? t('platform.shop.suspendDescription') : t('platform.shop.resumeDescription') }}
            </p>
            <UButton
              v-if="current.status === 'active'"
              :label="t('platform.shop.suspend')"
              icon="i-lucide-pause"
              color="error"
              variant="outline"
              class="self-start"
              @click="confirming = 'suspend'"
            />
            <UButton
              v-else
              :label="t('platform.shop.resume')"
              icon="i-lucide-play"
              :loading="setStatus.pending.value"
              class="self-start"
              @click="setStatus.execute('resume')"
            />
          </UPageCard>
        </template>
      </div>

      <UModal
        :open="confirming !== null"
        :title="confirmText"
        :dismissible="!revoke.pending.value && !setStatus.pending.value"
        @update:open="open => { if (!open) confirming = null }"
      >
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton
              :label="t('common.actions.cancel')"
              color="neutral"
              variant="ghost"
              :disabled="revoke.pending.value || setStatus.pending.value"
              @click="confirming = null"
            />
            <UButton
              :label="confirmLabel"
              :color="confirming === 'suspend' ? 'error' : 'primary'"
              :loading="revoke.pending.value || setStatus.pending.value"
              @click="confirm()"
            />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
