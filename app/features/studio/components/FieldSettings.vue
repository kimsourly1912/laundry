<script setup lang="ts">
/**
 * A form field's settings in the contextual toolbar (plan §5.5): its label,
 * required, the type's own settings (§5.4.2), the value's style, and "Draw a border". Text inputs
 * apply when they lose focus or on Enter, so typing a label is one undo step.
 */
import type { ChoiceGroup, SlipElement } from '#shared/contracts/slip-design'
import { ALIGNS, MARKS } from '#shared/contracts/slip-design'
import type { StudioEditor } from '../composables/useStudioEditor'
import { updateElements } from '../utils/design-ops'

const props = defineProps<{ editor: StudioEditor, element: SlipElement }>()
const { t } = useI18n()
const { editor } = props

const LABELLED = new Set(['number', 'textField', 'checkbox', 'option', 'phone', 'amount', 'paid'])
const REQUIRABLE = new Set(['number', 'textField', 'checkbox', 'phone', 'amount'])
const STYLED = new Set(['number', 'textField', 'orderNo', 'date', 'phone', 'amount'])
const BORDERED = new Set(['number', 'textField', 'checkbox', 'option', 'orderNo', 'date', 'phone', 'amount', 'paid'])

const element = computed(() => props.element)
const group = computed(() => (element.value.type === 'option' ? editor.design.value.groups.find(item => item.id === (element.value as { group: string }).group) : undefined))
const styled = computed(() => STYLED.has(element.value.type))

/** Any field of the element: TypeScript can't follow a key across the union, the schema checks it on save. */
function set(update: Record<string, unknown>) {
  editor.apply(updateElements(editor.design.value, [element.value.id], item => ({ ...item, ...update }) as SlipElement))
}

function setGroup(update: Partial<ChoiceGroup>) {
  const current = group.value
  if (!current) return
  editor.apply({ ...editor.design.value, groups: editor.design.value.groups.map(item => (item.id === current.id ? { ...item, ...update } : item)) })
}

function setLabel(value: string) {
  if ('label' in element.value) set({ label: value.trim().slice(0, 60) })
}

function setGroupLabel(value: string) {
  if (group.value) setGroup({ label: value.trim().slice(0, 60) })
}

const textValue = (event: Event) => (event.target as HTMLInputElement).value
function numberValue(value: number | null | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

const markItems = computed(() => MARKS.map(mark => ({ value: mark, label: t(`studio.field.marks.${mark}`) })))
const alignItems = computed(() => ALIGNS.map(align => ({ value: align, icon: `i-lucide-align-${align === 'center' ? 'center' : align}`, label: t(`studio.field.align.${align}`) })))
const decimalItems = computed(() => [0, 1, 2].map(value => ({ value, label: t(`studio.field.decimals.${value}`) })))
</script>

<template>
  <div class="flex items-center gap-1">
    <UPopover v-if="LABELLED.has(element.type)">
      <UButton
        :label="t('studio.field.label')"
        icon="i-lucide-tag"
        size="xs"
        color="neutral"
        variant="outline"
      />
      <template #content>
        <div class="w-72 space-y-3 p-3">
          <UFormField :label="t('studio.field.label')">
            <UInput
              :model-value="'label' in element ? element.label : ''"
              :maxlength="60"
              class="w-full"
              data-testid="label"
              @change="setLabel(textValue($event))"
            />
          </UFormField>
          <p class="text-xs text-muted">
            {{ t('studio.field.labelHint') }}
          </p>
        </div>
      </template>
    </UPopover>

    <UPopover v-if="element.type === 'option' && group">
      <UButton
        :label="t('studio.field.group')"
        icon="i-lucide-list-checks"
        size="xs"
        color="neutral"
        variant="outline"
      />
      <template #content>
        <div class="w-72 space-y-3 p-3">
          <UFormField :label="t('studio.field.groupLabel')">
            <UInput
              :model-value="group.label"
              :maxlength="60"
              class="w-full"
              data-testid="group-label"
              @change="setGroupLabel(textValue($event))"
            />
          </UFormField>
          <UCheckbox
            :model-value="group.required"
            :label="t('studio.field.required')"
            @update:model-value="setGroup({ required: Boolean($event) })"
          />
          <UFormField :label="t('studio.field.mark')">
            <USelect
              :model-value="group.mark"
              :items="markItems"
              class="w-full"
              @update:model-value="setGroup({ mark: $event })"
            />
          </UFormField>
        </div>
      </template>
    </UPopover>

    <UPopover v-if="REQUIRABLE.has(element.type) || ['number', 'textField', 'checkbox', 'paid', 'option'].includes(element.type)">
      <UButton
        :label="t('studio.field.settings')"
        icon="i-lucide-sliders-horizontal"
        size="xs"
        color="neutral"
        variant="outline"
      />
      <template #content>
        <div class="w-72 space-y-3 p-3">
          <UCheckbox
            v-if="REQUIRABLE.has(element.type) && 'required' in element"
            :model-value="element.required"
            :label="t('studio.field.required')"
            data-testid="required"
            @update:model-value="set({ required: Boolean($event) })"
          />
          <template v-if="element.type === 'number'">
            <UFormField :label="t('studio.field.decimalsLabel')">
              <USelect
                :model-value="element.decimals"
                :items="decimalItems"
                class="w-full"
                @update:model-value="set({ decimals: $event })"
              />
            </UFormField>
            <div class="flex gap-2">
              <UFormField :label="t('studio.field.min')">
                <UInputNumber
                  :model-value="element.min"
                  :max="element.max"
                  size="sm"
                  @update:model-value="set({ min: numberValue($event, element.min) })"
                />
              </UFormField>
              <UFormField :label="t('studio.field.max')">
                <UInputNumber
                  :model-value="element.max"
                  :min="element.min"
                  size="sm"
                  @update:model-value="set({ max: numberValue($event, element.max) })"
                />
              </UFormField>
            </div>
            <UFormField :label="t('studio.field.unit')">
              <UInput
                :model-value="element.unit"
                :maxlength="10"
                :placeholder="t('studio.field.unitPlaceholder')"
                @change="set({ unit: textValue($event).trim().slice(0, 10) })"
              />
            </UFormField>
          </template>
          <UFormField
            v-if="element.type === 'textField'"
            :label="t('studio.field.maxLength')"
          >
            <UInputNumber
              :model-value="element.maxLength"
              :min="1"
              :max="200"
              size="sm"
              @update:model-value="set({ maxLength: Math.min(200, Math.max(1, Math.round(numberValue($event, element.maxLength)))) })"
            />
          </UFormField>
          <UFormField
            v-if="element.type === 'checkbox' || element.type === 'paid'"
            :label="t('studio.field.mark')"
          >
            <USelect
              :model-value="element.mark"
              :items="markItems"
              class="w-full"
              @update:model-value="set({ mark: $event })"
            />
          </UFormField>
          <UFormField
            v-if="element.type === 'checkbox' || element.type === 'paid' || element.type === 'option'"
            :label="t('studio.field.markColor')"
          >
            <input
              type="color"
              :value="element.color"
              class="h-8 w-16 cursor-pointer rounded border border-default"
              :aria-label="t('studio.field.markColor')"
              @change="set({ color: textValue($event) })"
            >
          </UFormField>
        </div>
      </template>
    </UPopover>

    <UPopover v-if="styled && 'size' in element">
      <UButton
        :label="t('studio.field.style')"
        icon="i-lucide-type"
        size="xs"
        color="neutral"
        variant="outline"
      />
      <template #content>
        <div class="w-72 space-y-3 p-3">
          <div class="flex items-end gap-2">
            <UFormField :label="t('studio.field.size')">
              <UInputNumber
                :model-value="element.size"
                :min="6"
                :max="400"
                size="sm"
                @update:model-value="set({ size: Math.min(400, Math.max(6, numberValue($event, element.size))) })"
              />
            </UFormField>
            <UFormField :label="t('studio.field.color')">
              <input
                type="color"
                :value="element.color"
                class="h-8 w-16 cursor-pointer rounded border border-default"
                :aria-label="t('studio.field.color')"
                @change="set({ color: textValue($event) })"
              >
            </UFormField>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              icon="i-lucide-bold"
              size="sm"
              color="neutral"
              :variant="element.bold ? 'solid' : 'outline'"
              :aria-label="t('studio.field.bold')"
              :aria-pressed="element.bold"
              @click="set({ bold: !element.bold })"
            />
            <UButton
              v-for="item in alignItems"
              :key="item.value"
              :icon="item.icon"
              size="sm"
              color="neutral"
              :variant="element.align === item.value ? 'solid' : 'outline'"
              :aria-label="item.label"
              :aria-pressed="element.align === item.value"
              @click="set({ align: item.value })"
            />
          </div>
        </div>
      </template>
    </UPopover>

    <UCheckbox
      v-if="BORDERED.has(element.type) && 'border' in element"
      :model-value="element.border"
      :label="t('studio.field.border')"
      class="ms-1 text-xs"
      @update:model-value="set({ border: Boolean($event) })"
    />
  </div>
</template>
