<script setup lang="ts">
/** Sign in with username and password (spec P4); then the session's home or the page asked for. */
import type { FormSubmitEvent } from '@nuxt/ui'
import type * as v from 'valibot'
import { signInFormSchema } from '../schemas/account-form'

const { t, te } = useI18n()
const route = useRoute()
const session = useSession()
const schema = computed(() => signInFormSchema(t))
type Form = v.InferOutput<ReturnType<typeof signInFormSchema>>
const state = reactive({ username: '', password: '' })
const form = useTemplateRef('form')
useFormErrorRecheck(form)

const signIn = useMutation((form: Form) => apiFetch('/auth/sign-in/username', { method: 'POST', body: form }), { inline: true })
const failure = computed(() => (signIn.error.value ? errorText(signIn.error.value, t, te) : undefined))

async function onSubmit(event: FormSubmitEvent<Form>) {
  // Whoever was here before: nothing of theirs survives the next person's sign-in.
  session.end()
  const result = await signIn.execute(event.data)
  if (!result.ok) return
  const me = await session.load()
  if (me) await navigateTo(me.mustChangePassword ? { path: '/change-password', query: route.query } : (safeRedirect(route.query.redirect) ?? homePath(me)))
}
</script>

<template>
  <div class="space-y-5">
    <div class="space-y-1">
      <h1 class="text-xl font-semibold">
        {{ t('account.signIn.title') }}
      </h1>
      <p class="text-sm text-muted">
        {{ t('account.signIn.description') }}
      </p>
    </div>

    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="failure"
      role="alert"
    />

    <UForm
      ref="form"
      :schema="schema"
      :state="state"
      :validate-on="['input', 'change']"
      :disabled="signIn.pending.value"
      class="space-y-4"
      @submit="onSubmit"
      @error="focusFirstError"
    >
      <UFormField
        :label="t('account.signIn.username')"
        name="username"
        required
      >
        <UInput
          v-model="state.username"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          class="w-full"
        />
      </UFormField>
      <UFormField
        :label="t('account.signIn.password')"
        name="password"
        required
      >
        <UInput
          v-model="state.password"
          type="password"
          autocomplete="current-password"
          class="w-full"
        />
      </UFormField>
      <UButton
        type="submit"
        :label="t('account.signIn.submit')"
        :loading="signIn.pending.value"
        block
      />
    </UForm>
  </div>
</template>
