<script setup lang="ts">
/**
 * New template (plan §5.2): from a photo of the paper slip (the main way), a blank canvas of a preset
 * or custom size, or a copy of another template. Opens the studio on the new draft.
 */
import { CANVAS_MAX_SIDE, CANVAS_MIN_SIDE, CANVAS_PRESETS } from '#shared/contracts/slip-design'
import type { ImageSummary, TemplateDetail, TemplateStart, TemplateSummary } from '#shared/contracts/templates'
import { IMAGE_MAX_BYTES, IMAGE_SOFT_SIDE } from '#shared/contracts/templates'
import type { Page } from '#shared/contracts/common'

const open = defineModel<boolean>('open', { required: true })

const { t, te } = useI18n()

type Kind = TemplateStart['kind']
const kind = ref<Kind>('photo')
const name = ref('')
const preset = ref<string>(CANVAS_PRESETS[0].key)
const custom = reactive({ width: 1200, height: 800 })
const copyFrom = ref<string>()
const photo = shallowRef<ImageSummary>()
const photoError = ref<string>()

const kinds = computed(() => [
  { value: 'photo', label: t('studio.new.photo'), description: t('studio.new.photoHint') },
  { value: 'blank', label: t('studio.new.blank'), description: t('studio.new.blankHint') },
  { value: 'copy', label: t('studio.new.copy'), description: t('studio.new.copyHint') },
])
const presets = computed(() => [
  ...CANVAS_PRESETS.map(item => ({ value: item.key, label: `${t(`studio.new.presets.${item.key}`)} · ${item.width} × ${item.height}` })),
  { value: 'custom', label: t('studio.new.presets.custom') },
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

// --- The photo ---

const upload = useMutation((file: File) => apiFetch<ImageSummary>('/platform/images', { method: 'POST', query: { name: file.name }, body: file, headers: { 'content-type': file.type || 'application/octet-stream' } }), { inline: true })

async function choosePhoto(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  photoError.value = undefined
  if (file.size > IMAGE_MAX_BYTES) {
    photoError.value = t('studio.new.photoTooLarge')
    return
  }
  const result = await upload.execute(file)
  if (result.ok) {
    photo.value = result.data
    if (!name.value) name.value = file.name.replace(/\.[^.]+$/, '')
  }
  else {
    photoError.value = errorText(result.error, t, te)
  }
}
const softPhoto = computed(() => photo.value && Math.max(photo.value.width, photo.value.height) < IMAGE_SOFT_SIDE)

// --- Create ---

const start = computed<TemplateStart | undefined>(() => {
  if (kind.value === 'photo') return photo.value ? { kind: 'photo', imageId: photo.value.id } : undefined
  if (kind.value === 'copy') return copyFrom.value ? { kind: 'copy', templateId: copyFrom.value } : undefined
  const size = CANVAS_PRESETS.find(item => item.key === preset.value) ?? custom
  return { kind: 'blank', width: size.width, height: size.height }
})
const sizeValid = computed(() => [custom.width, custom.height].every(side => Number.isInteger(side) && side >= CANVAS_MIN_SIDE && side <= CANVAS_MAX_SIDE))
const ready = computed(() => Boolean(name.value.trim() && start.value && (kind.value !== 'blank' || preset.value !== 'custom' || sizeValid.value)))

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
  kind.value = 'photo'
  name.value = ''
  photo.value = undefined
  photoError.value = undefined
  copyFrom.value = undefined
  create.reset()
})
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('studio.new.title')"
    :dismissible="!create.pending.value && !upload.pending.value"
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

        <div
          v-if="kind === 'photo'"
          class="space-y-2"
        >
          <label class="block">
            <span class="sr-only">{{ t('studio.new.choosePhoto') }}</span>
            <input
              type="file"
              accept="image/png,image/jpeg"
              class="block w-full text-sm file:me-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-inverted"
              :disabled="upload.pending.value"
              data-testid="photo-input"
              @change="choosePhoto"
            >
          </label>
          <p class="text-xs text-muted">
            {{ t('studio.new.photoRules') }}
          </p>
          <p
            v-if="upload.pending.value"
            class="text-sm text-muted"
          >
            {{ t('studio.new.uploading') }}
          </p>
          <p
            v-if="photo"
            class="text-sm"
          >
            {{ t('studio.new.photoReady', { width: photo.width, height: photo.height }) }}
          </p>
          <UAlert
            v-if="softPhoto"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :title="t('studio.new.softPhoto', { side: IMAGE_SOFT_SIDE })"
          />
          <p
            v-if="photoError"
            class="text-sm text-error"
            role="alert"
          >
            {{ photoError }}
          </p>
        </div>

        <div
          v-else-if="kind === 'blank'"
          class="space-y-3"
        >
          <UFormField :label="t('studio.new.size')">
            <USelect
              v-model="preset"
              :items="presets"
              class="w-full"
            />
          </UFormField>
          <div
            v-if="preset === 'custom'"
            class="flex gap-3"
          >
            <UFormField
              :label="t('studio.new.width')"
              :error="sizeValid ? undefined : t('studio.new.sizeRange', { min: CANVAS_MIN_SIDE, max: CANVAS_MAX_SIDE })"
            >
              <UInputNumber
                v-model="custom.width"
                :min="CANVAS_MIN_SIDE"
                :max="CANVAS_MAX_SIDE"
              />
            </UFormField>
            <UFormField :label="t('studio.new.height')">
              <UInputNumber
                v-model="custom.height"
                :min="CANVAS_MIN_SIDE"
                :max="CANVAS_MAX_SIDE"
              />
            </UFormField>
          </div>
        </div>

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
          :disabled="!ready || upload.pending.value"
          :loading="create.pending.value"
        />
      </div>
    </template>
  </UModal>
</template>
