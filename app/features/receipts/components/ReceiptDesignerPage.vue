<script setup lang="ts">
/**
 * A shop's receipt design (D28), for the platform: the shop's own slip artwork as the background,
 * and fields placed on it, each bound to the order's data. Drag a field to move it (or use the
 * arrow keys, Shift for 10 px); its size, colour and alignment are on the side. Preview asks the
 * server for its own PNG with made-up values: that's exactly what a customer gets on Telegram.
 * Saved whole, at the version read.
 */
import type { PlatformShop } from '#shared/contracts/platform-shops'
import type { PriceItemList, ServiceTypeList } from '#shared/contracts/pricing'
import type { ReceiptDesign, ReceiptDesignResponse, ReceiptField } from '#shared/contracts/receipts'
import { MAX_RECEIPT_FIELDS, MAX_RECEIPT_IMAGE_BYTES, RECEIPT_ALIGNS } from '#shared/contracts/receipts'
import { checkMarkPath, checkMarkWidth, fieldText, isTextField, RECEIPT_FONT } from '#shared/receipt-fields'
import type { FieldChoice } from '../schemas/receipt-design'
import { clampPoint, designValues, fieldChoices, fieldLabel, newField } from '../schemas/receipt-design'

const props = defineProps<{ shopId: string }>()
const { t, te, locale } = useI18n()
const { can } = useSession()
const editable = computed(() => can('receipt:write'))
const base = `/platform/shops/${props.shopId}`

const shop = useApiQuery(() => `platform:shop:${props.shopId}`, () => apiFetch<PlatformShop>(base))
const loaded = useApiQuery(() => `platform:receipt:${props.shopId}`, () => apiFetch<ReceiptDesignResponse>(`${base}/receipt`))
const types = useApiQuery(() => `platform:prices:${props.shopId}:types`, () => apiFetch<ServiceTypeList>(`${base}/service-types`))
const items = useApiQuery(() => `platform:prices:${props.shopId}:items`, () => apiFetch<PriceItemList>(`${base}/price-items`))
const design = computed(() => loaded.data.value?.design ?? null)
const names = computed(() => ({ types: types.data.value?.items ?? [], items: items.data.value?.items ?? [] }))

// --- The fields being edited, against the saved ones ---
const fields = ref<ReceiptField[]>([])
const baseline = ref('[]')
watch(design, (value) => {
  if (!value) return
  fields.value = structuredClone(toRaw(value.fields))
  baseline.value = JSON.stringify(value.fields)
}, { immediate: true })
const dirty = computed(() => JSON.stringify(fields.value) !== baseline.value)
const selectedId = ref<string>()
const selected = computed(() => fields.value.find(field => field.id === selectedId.value))
const label = (field: ReceiptField | FieldChoice) => fieldLabel(field, names.value, t, locale.value)

const values = computed(() => designValues({
  shopName: shop.data.value?.name ?? '',
  total: formatMoney(shop.data.value?.currency === 'USD' ? 1250 : 13_500, shop.data.value?.currency ?? 'KHR', locale.value),
  date: formatDateTime(new Date().toISOString(), locale.value),
  fields: fields.value,
  t,
}))

// --- Adding and removing ---
const choices = computed(() => fieldChoices(names.value).map(choice => ({ label: label(choice), choice })))
const adding = ref<{ label: string, choice: FieldChoice }>()
watch(adding, (entry) => {
  if (!entry || !design.value) return
  const field = newField(entry.choice, design.value, fields.value)
  fields.value.push(field)
  selectedId.value = field.id
  nextTick(() => {
    adding.value = undefined
  })
})
const full = computed(() => fields.value.length >= MAX_RECEIPT_FIELDS)
function remove(id: string) {
  fields.value = fields.value.filter(field => field.id !== id)
  selectedId.value = undefined
}

// --- Moving: drag on the canvas, or arrow keys on a selected field ---
const canvas = useTemplateRef<SVGSVGElement>('canvas')
let drag: { id: string, dx: number, dy: number, pointerId: number } | undefined
function toCanvas(event: PointerEvent) {
  const matrix = canvas.value?.getScreenCTM()?.inverse()
  if (!matrix) return undefined
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix)
  return { x: point.x, y: point.y }
}
function startDrag(event: PointerEvent, field: ReceiptField) {
  selectedId.value = field.id
  if (!editable.value) return
  const point = toCanvas(event)
  if (!point) return
  drag = { id: field.id, dx: field.x - point.x, dy: field.y - point.y, pointerId: event.pointerId }
  ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
}
function onDrag(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId || !design.value) return
  const point = toCanvas(event)
  const field = fields.value.find(entry => entry.id === drag!.id)
  if (!point || !field) return
  Object.assign(field, clampPoint({ x: point.x + drag.dx, y: point.y + drag.dy }, design.value))
}
function endDrag() {
  drag = undefined
}
function nudge(event: KeyboardEvent, field: ReceiptField) {
  const step = event.shiftKey ? 10 : 1
  const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key]
  if (!delta || !design.value || !editable.value) return
  event.preventDefault()
  Object.assign(field, clampPoint({ x: field.x + delta[0]!, y: field.y + delta[1]! }, design.value))
}

// --- The background ---
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const upload = useMutation((file: File) => apiFetch<ReceiptDesign>(`${base}/receipt/background`, {
  method: 'PUT',
  body: file,
  headers: { 'content-type': file.type || 'application/octet-stream' },
  query: design.value ? { version: design.value.version } : undefined,
}), {
  invalidate: ['platform'],
  success: () => t('receipts.uploaded'),
})
const tooBig = ref(false)
async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  tooBig.value = Boolean(file && file.size > MAX_RECEIPT_IMAGE_BYTES)
  if (!file || tooBig.value) return
  // A replaced image keeps the saved fields; unsaved moves would be lost on reload, so save first.
  await upload.execute(file)
}
const backgroundUrl = computed(() => design.value && `/api${base}/receipt/background?v=${design.value.version}`)

// --- Save and preview ---
const save = useMutation((list: ReceiptField[]) => apiFetch<ReceiptDesign>(`${base}/receipt`, { method: 'PATCH', body: { version: design.value!.version, fields: list } }), {
  invalidate: ['platform'],
  success: () => t('receipts.saved'),
})
useUnsavedChanges(() => dirty.value && !save.pending.value)
async function onSave() {
  const result = await save.execute(fields.value)
  if (result.ok) baseline.value = JSON.stringify(result.data.fields)
}

const previewUrl = ref<string>()
const preview = useMutation((list: ReceiptField[]) => apiFetch<Blob>(`${base}/receipt/preview`, { method: 'POST', body: { fields: list }, responseType: 'blob' } as never))
async function onPreview() {
  const result = await preview.execute(fields.value)
  if (!result.ok) return
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = URL.createObjectURL(result.data)
}
function closePreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = undefined
}
onBeforeUnmount(closePreview)

const conflict = computed(() => [save.error.value, upload.error.value].some(error => error?.code === 'VERSION_CONFLICT'))
const uploadFailure = computed(() => (upload.error.value ? errorText(upload.error.value, t, te) : undefined))
const loadError = computed(() => loaded.error.value ?? shop.error.value)
</script>

<template>
  <UDashboardPanel id="platform-receipt">
    <template #header>
      <UDashboardNavbar :title="shop.data.value ? t('receipts.titleFor', { shop: shop.data.value.name }) : t('receipts.title')">
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            :aria-label="t('receipts.back')"
            :to="base"
          />
        </template>
        <template
          v-if="design"
          #right
        >
          <UButton
            :label="t('receipts.preview')"
            icon="i-lucide-eye"
            color="neutral"
            variant="outline"
            :loading="preview.pending.value"
            @click="onPreview"
          />
          <UButton
            v-if="editable"
            :label="t('common.actions.save')"
            :disabled="!dirty"
            :loading="save.pending.value"
            @click="onSave"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <PageLoadError
        v-if="loadError && !loaded.data.value"
        :error="loadError"
        @retry="loaded.refresh(); shop.refresh()"
      />
      <USkeleton
        v-else-if="!loaded.data.value"
        class="h-96 w-full"
      />
      <div
        v-else
        class="space-y-4"
      >
        <UAlert
          v-if="conflict"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="t('receipts.conflict')"
          :actions="[{ label: t('common.actions.reload'), color: 'neutral', variant: 'outline', onClick: () => { loaded.refresh() } }]"
        />
        <UAlert
          v-if="uploadFailure || tooBig"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="tooBig ? t('receipts.tooBig') : uploadFailure"
        />

        <input
          ref="fileInput"
          type="file"
          accept="image/png,image/jpeg"
          class="sr-only"
          :aria-label="t('receipts.chooseImage')"
          @change="onFile"
        >

        <UEmpty
          v-if="!design"
          icon="i-lucide-receipt-text"
          :title="t('receipts.empty')"
          :description="t('receipts.emptyDescription')"
          :actions="editable ? [{ label: t('receipts.upload'), icon: 'i-lucide-upload', loading: upload.pending.value, onClick: () => fileInput?.click() }] : []"
        />

        <div
          v-else
          class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]"
        >
          <div class="min-w-0 space-y-2">
            <p class="text-sm text-muted">
              {{ t('receipts.canvasHelp') }}
            </p>
            <div class="overflow-hidden rounded-md border border-default bg-elevated">
              <svg
                ref="canvas"
                :viewBox="`0 0 ${design.width} ${design.height}`"
                class="block h-auto w-full touch-none select-none"
                role="group"
                :aria-label="t('receipts.canvas')"
                @pointermove="onDrag"
                @pointerup="endDrag"
                @pointercancel="endDrag"
              >
                <image
                  :href="backgroundUrl ?? undefined"
                  x="0"
                  y="0"
                  :width="design.width"
                  :height="design.height"
                  preserveAspectRatio="none"
                />
                <g
                  v-for="field in fields"
                  :key="field.id"
                  tabindex="0"
                  role="button"
                  :aria-label="label(field)"
                  :aria-pressed="field.id === selectedId"
                  class="cursor-move outline-none"
                  @pointerdown="startDrag($event, field)"
                  @keydown="nudge($event, field)"
                  @focus="selectedId = field.id"
                >
                  <text
                    v-if="isTextField(field)"
                    :x="field.x"
                    :y="field.y"
                    :font-family="`${RECEIPT_FONT}, ui-sans-serif, system-ui, sans-serif`"
                    :font-size="field.size"
                    :font-weight="field.bold ? 700 : 400"
                    :fill="field.color"
                    :text-anchor="field.align"
                  >{{ fieldText(field, values) || '—' }}</text>
                  <template v-else>
                    <rect
                      :x="field.x"
                      :y="field.y"
                      :width="field.size"
                      :height="field.size"
                      fill="transparent"
                      :stroke="field.color"
                      stroke-dasharray="4 3"
                      stroke-opacity="0.5"
                    />
                    <path
                      :d="checkMarkPath(field.x, field.y, field.size)"
                      fill="none"
                      :stroke="field.color"
                      :stroke-width="checkMarkWidth(field.size)"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </template>
                  <circle
                    :cx="field.x"
                    :cy="field.y"
                    :r="Math.max(4, design.width / 200)"
                    :class="field.id === selectedId ? 'fill-primary' : 'fill-primary/40'"
                  />
                </g>
              </svg>
            </div>
            <div
              v-if="editable"
              class="flex flex-wrap items-center gap-2"
            >
              <UButton
                :label="t('receipts.replace')"
                icon="i-lucide-image-up"
                color="neutral"
                variant="outline"
                :loading="upload.pending.value"
                :disabled="dirty"
                @click="fileInput?.click()"
              />
              <span
                v-if="dirty"
                class="text-sm text-muted"
              >{{ t('receipts.saveBeforeReplace') }}</span>
              <span class="text-sm text-muted">{{ t('receipts.imageSize', { width: design.width, height: design.height }) }}</span>
            </div>
          </div>

          <div class="space-y-4">
            <UFormField
              v-if="editable"
              :label="t('receipts.add')"
              :help="full ? t('receipts.full', { max: MAX_RECEIPT_FIELDS }) : t('receipts.addHelp')"
            >
              <USelectMenu
                v-model="adding"
                :items="choices"
                :placeholder="t('receipts.addPlaceholder')"
                :search-input="{ placeholder: t('receipts.search') }"
                :disabled="full"
                class="w-full"
              />
            </UFormField>

            <UPageCard
              v-if="selected"
              :title="label(selected)"
              variant="subtle"
            >
              <div class="grid grid-cols-2 gap-3">
                <UFormField :label="t('receipts.x')">
                  <UInputNumber
                    v-model="selected.x"
                    :min="0"
                    :max="design.width"
                    :disabled="!editable"
                  />
                </UFormField>
                <UFormField :label="t('receipts.y')">
                  <UInputNumber
                    v-model="selected.y"
                    :min="0"
                    :max="design.height"
                    :disabled="!editable"
                  />
                </UFormField>
                <UFormField :label="isTextField(selected) ? t('receipts.fontSize') : t('receipts.tickSize')">
                  <UInputNumber
                    v-model="selected.size"
                    :min="8"
                    :max="400"
                    :disabled="!editable"
                  />
                </UFormField>
                <UFormField :label="t('receipts.color')">
                  <UInput
                    v-model="selected.color"
                    type="color"
                    class="w-full"
                    :disabled="!editable"
                  />
                </UFormField>
                <template v-if="isTextField(selected)">
                  <UFormField
                    :label="t('receipts.align')"
                    class="col-span-2"
                  >
                    <USelect
                      v-model="selected.align"
                      :items="RECEIPT_ALIGNS.map(align => ({ label: t(`receipts.aligns.${align}`), value: align }))"
                      class="w-full"
                      :disabled="!editable"
                    />
                  </UFormField>
                  <USwitch
                    v-model="selected.bold"
                    :label="t('receipts.bold')"
                    class="col-span-2"
                    :disabled="!editable"
                  />
                </template>
              </div>
              <template
                v-if="editable"
                #footer
              >
                <UButton
                  :label="t('receipts.remove')"
                  icon="i-lucide-trash-2"
                  color="error"
                  variant="outline"
                  @click="remove(selected.id)"
                />
              </template>
            </UPageCard>

            <div>
              <h2 class="mb-2 text-sm font-medium">
                {{ t('receipts.fields', { count: fields.length }) }}
              </h2>
              <p
                v-if="!fields.length"
                class="text-sm text-muted"
              >
                {{ t('receipts.noFields') }}
              </p>
              <ul
                v-else
                class="divide-y divide-default rounded-md border border-default"
              >
                <li
                  v-for="field in fields"
                  :key="field.id"
                >
                  <button
                    type="button"
                    class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-elevated"
                    :class="field.id === selectedId ? 'bg-elevated font-medium' : ''"
                    :aria-pressed="field.id === selectedId"
                    @click="selectedId = field.id"
                  >
                    <span class="truncate">{{ label(field) }}</span>
                    <span class="shrink-0 text-muted tabular-nums">{{ field.x }}, {{ field.y }}</span>
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <UModal
        :open="Boolean(previewUrl)"
        :title="t('receipts.previewTitle')"
        :description="t('receipts.previewDescription')"
        :ui="{ content: 'sm:max-w-4xl' }"
        @update:open="open => { if (!open) closePreview() }"
      >
        <template #body>
          <img
            v-if="previewUrl"
            :src="previewUrl"
            :alt="t('receipts.previewAlt')"
            class="h-auto w-full rounded-md"
          >
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
