<script setup lang="ts">
/**
 * Ask for a new design (D39; product notes → AI-assisted design; guide → sheet 05): a photo of the
 * paper slip (a blank or covered one keeps customers' handwriting out), Keep the layout or Redesign
 * it, and notes for the platform. The photo is made small enough first (≤ 2000 px, ≤ 1 MB).
 */
import type { TemplateRequest } from '#shared/contracts/template-requests'
import { REQUEST_NOTES_MAX } from '#shared/contracts/template-requests'
import { ArtworkError, prepareArtwork } from '~/features/studio'

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ sent: [request: TemplateRequest] }>()

const { t, te } = useI18n()
const kind = ref<'keep' | 'redesign'>('keep')
const notes = ref('')
const photo = shallowRef<Blob>()
const preview = ref<string>()
const photoProblem = ref<string>()
watch(open, (value) => {
  if (!value) return
  kind.value = 'keep'
  notes.value = ''
  photo.value = undefined
  photoProblem.value = undefined
  if (preview.value) URL.revokeObjectURL(preview.value)
  preview.value = undefined
})
onBeforeUnmount(() => {
  if (preview.value) URL.revokeObjectURL(preview.value)
})

async function choose(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  photoProblem.value = undefined
  try {
    const prepared = await prepareArtwork(file)
    photo.value = prepared.file
    if (preview.value) URL.revokeObjectURL(preview.value)
    preview.value = URL.createObjectURL(prepared.file)
  }
  catch (error) {
    photo.value = undefined
    photoProblem.value = error instanceof ArtworkError ? t(`studio.artwork.problems.${error.problem}`) : t('studio.artwork.problems.unreadable')
  }
}

const send = useMutation(() => apiFetch<TemplateRequest>('/shop/template-requests', {
  method: 'POST',
  query: { kind: kind.value, notes: notes.value.trim() },
  body: photo.value!,
  headers: { 'content-type': photo.value!.type || 'application/octet-stream' },
}), { inline: true, invalidate: ['orders'], success: () => t('orders.requests.sent') })
const failure = computed(() => (send.error.value ? errorText(send.error.value, t, te) : undefined))

async function submit() {
  if (!photo.value) return
  const result = await send.execute(undefined)
  if (!result.ok) return
  emit('sent', result.data)
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('orders.requests.title')"
    :description="t('orders.requests.description')"
    :dismissible="!send.pending.value"
  >
    <template #body>
      <div class="space-y-4">
        <UAlert
          v-if="failure"
          color="error"
          variant="subtle"
          :title="failure"
          role="alert"
        />
        <UFormField
          :label="t('orders.requests.photo')"
          :help="t('orders.requests.photoHelp')"
          :error="photoProblem"
          required
        >
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            class="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-inverted"
            data-testid="request-photo"
            @change="choose"
          >
        </UFormField>
        <img
          v-if="preview"
          :src="preview"
          :alt="t('orders.requests.photoAlt')"
          class="max-h-48 rounded border border-default"
        >
        <UFormField :label="t('orders.requests.kind')">
          <URadioGroup
            v-model="kind"
            :items="[{ label: t('orders.requests.keep'), description: t('orders.requests.keepHelp'), value: 'keep' }, { label: t('orders.requests.redesign'), description: t('orders.requests.redesignHelp'), value: 'redesign' }]"
            variant="card"
            :ui="{ fieldset: 'gap-2' }"
          />
        </UFormField>
        <UFormField
          :label="t('orders.requests.notes')"
          :hint="t('common.optional')"
        >
          <UTextarea
            v-model="notes"
            :maxlength="REQUEST_NOTES_MAX"
            :rows="3"
            class="w-full"
            data-testid="request-notes"
          />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          :label="t('common.actions.cancel')"
          color="neutral"
          variant="ghost"
          :disabled="send.pending.value"
          @click="open = false"
        />
        <UButton
          :label="t('orders.requests.send')"
          icon="i-lucide-send"
          :loading="send.pending.value"
          :disabled="!photo"
          data-testid="request-send"
          @click="submit"
        />
      </div>
    </template>
  </UModal>
</template>
