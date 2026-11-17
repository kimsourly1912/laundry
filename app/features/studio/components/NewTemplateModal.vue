<script setup lang="ts">
/**
 * New template (plan §5.2, D35): from an artwork (made by AI or a designer; the main way) or a copy
 * of another template. Opens the studio on the new draft.
 */
import type { ImageSummary, TemplateDetail, TemplateStart, TemplateSummary } from '#shared/contracts/templates'
import type { Page } from '#shared/contracts/common'
import ArtworkPicker from './ArtworkPicker.vue'

const open = defineModel<boolean>('open', { required: true })

const { t, te } = useI18n()

type Kind = TemplateStart['kind']
const kind = ref<Kind>('artwork')
const name = ref('')
const copyFrom = ref<string>()
const artwork = shallowRef<ImageSummary>()

const kinds = computed(() => [
  { value: 'artwork', label: t('studio.new.artwork'), description: t('studio.new.artworkHint') },
  { value: 'copy', label: t('studio.new.copy'), description: t('studio.new.copyHint') },
])

const others = useApiQuery('studio:template-choices', () => apiFetch<Page<TemplateSummary>>('/platform/templates', { query: { pageSize: 100 } }), { immediate: false })
watch(kind, (value) => {
  if (value === 'copy' && !others.data.value) others.refresh()
})
const copyItems = computed(() => (others.data.value?.items ?? []).map(item => ({ value: item.id, label: item.name })))
watch(copyFrom, (id) => {
  const source = others.data.value?.items.find(item => item.id === id)
  if (source && !name.value) name.value = t('studio.new.copyName', { name: source.name })
})

function artworkChosen(file: File) {
  if (!name.value) name.value = file.name.replace(/\.[^.]+$/, '')
}

// --- Create ---

const start = computed<TemplateStart | undefined>(() => {
  if (kind.value === 'artwork') return artwork.value ? { kind: 'artwork', imageId: artwork.value.id } : undefined
  return copyFrom.value ? { kind: 'copy', templateId: copyFrom.value } : undefined
})
const ready = computed(() => Boolean(name.value.trim() && start.value))

const create = useMutation((body: { name: string, start: TemplateStart }) => apiFetch<TemplateDetail>('/platform/templates', { method: 'POST', body }), { inline: true, invalidate: ['studio'] })
const nameError = computed(() => create.error.value?.fieldErrors?.name?.[0])

async function submit() {
  if (!ready.value || !start.value) return
  const result = await create.execute({ name: name.value.trim(), start: start.value })
  if (result.ok) {
    open.value = false
    await navigateTo(`/platform/templates/${result.data.id}`)
  }
}

watch(open, (value) => {
  if (!value) return
  kind.value = 'artwork'
  name.value = ''
  artwork.value = undefined
  copyFrom.value = undefined
  create.reset()
})
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('studio.new.title')"
    :dismissible="!create.pending.value"
  >
    <template #body>
      <form
        id="new-template"
        class="space-y-5"
        @submit.prevent="submit"
      >
        <URadioGroup
          v-model="kind"
          :items="kinds"
          :legend="t('studio.new.start')"
          variant="card"
        />

        <ArtworkPicker
          v-if="kind === 'artwork'"
          v-model="artwork"
          @chosen="artworkChosen"
        />

        <UFormField
          v-else
          :label="t('studio.new.copyFrom')"
        >
          <USelect
            v-model="copyFrom"
            :items="copyItems"
            :loading="others.pending.value"
            :placeholder="t('studio.new.chooseTemplate')"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('studio.name')"
          :error="nameError"
          required
        >
          <UInput
            v-model="name"
            :maxlength="80"
            class="w-full"
          />
        </UFormField>

        <p
          v-if="create.error.value && !nameError"
          class="text-sm text-error"
          role="alert"
        >
          {{ errorText(create.error.value, t, te) }}
        </p>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          :label="t('common.actions.cancel')"
          color="neutral"
          variant="ghost"
          :disabled="create.pending.value"
          @click="open = false"
        />
        <UButton
          type="submit"
          form="new-template"
          :label="t('studio.new.create')"
          :disabled="!ready"
          :loading="create.pending.value"
        />
      </div>
    </template>
  </UModal>
</template>
