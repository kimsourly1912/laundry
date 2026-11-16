<script setup lang="ts">
/**
 * Change password (spec §12): current, new, new again. Every other session ends (Better Auth, and
 * our hook whatever the request says). Emits `changed` after success.
 */
import type { FormSubmitEvent } from '@nuxt/ui'
import { MIN_PASSWORD_LENGTH } from '#shared/contracts/identity'
import type { ChangePasswordForm } from '../schemas/account-form'
import { changePasswordFormSchema, toChangePasswordRequest } from '../schemas/account-form'

const emit = defineEmits<{ changed: [] }>()
const { t, te } = useI18n()
const { me } = useSession()
const schema = computed(() => changePasswordFormSchema(t))
const state = reactive<ChangePasswordForm>({ currentPassword: '', newPassword: '', confirmPassword: '' })
const form = useTemplateRef('form')
useFormErrorRecheck(form)

const change = useMutation((form: ChangePasswordForm) => apiFetch('/auth/change-password', { method: 'POST', body: toChangePasswordRequest(form) }), {
  inline: true,
  success: () => t('account.changePassword.done'),
})
const failure = computed(() => (change.error.value ? errorText(change.error.value, t, te) : undefined))

async function onSubmit(event: FormSubmitEvent<ChangePasswordForm>) {
  const result = await change.execute(event.data)
  if (!result.ok) return
  Object.assign(state, { currentPassword: '', newPassword: '', confirmPassword: '' })
  emit('changed')
}
</script>

<template>
  <UForm
    ref="form"
    :schema="schema"
    :state="state"
    :validate-on="['input', 'change']"
    :disabled="change.pending.value"
    class="space-y-4"
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
    />
    <!-- The account's username, for password managers. -->
    <input
      type="text"
      name="username"
      autocomplete="username"
      :value="me?.user.username ?? ''"
      class="hidden"
      readonly
      aria-hidden="true"
      tabindex="-1"
    >
    <UFormField
      :label="t('account.changePassword.current')"
      name="currentPassword"
      required
    >
      <UInput
        v-model="state.currentPassword"
        type="password"
        autocomplete="current-password"
        class="w-full"
      />
    </UFormField>
    <UFormField
      :label="t('account.changePassword.new')"
      :hint="t('account.changePassword.hint', { min: MIN_PASSWORD_LENGTH })"
      name="newPassword"
      required
    >
      <UInput
        v-model="state.newPassword"
        type="password"
        autocomplete="new-password"
        class="w-full"
      />
    </UFormField>
    <UFormField
      :label="t('account.changePassword.confirm')"
      name="confirmPassword"
      required
    >
      <UInput
        v-model="state.confirmPassword"
        type="password"
        autocomplete="new-password"
        class="w-full"
      />
    </UFormField>
    <UButton
      type="submit"
      :label="t('account.changePassword.submit')"
      :loading="change.pending.value"
      block
    />
  </UForm>
</template>
