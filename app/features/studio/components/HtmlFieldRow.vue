<script setup lang="ts">
/**
 * One intake field in the Studio's Intake fields view, as a card: its kind, label, Required, insert
 * or copy its placeholder, and remove; under it, whether the slip prints it (pilot plan §1): Placed,
 * Not placed, or Portal only when the admin keeps it off the printout on purpose. A built-in field
 * (phone, amount) can't be removed; a field the HTML prints can't be removed until the markup stops
 * using it.
 */
import { fieldPlaceholder } from '#shared/slip/checks'
import type { FieldPlacement } from '#shared/slip/checks'
import type { OwnerField } from '#shared/slip/fields'
import { portalOnlyPatch, requiredPatch, requiredState } from '../utils/field-flags'

const props = defineProps<{ field: OwnerField, readOnly: boolean, builtIn: boolean, placement: FieldPlacement }>()
const emit = defineEmits<{
  update: [patch: { label?: string, required?: boolean, printRequired?: boolean, portalOnly?: boolean }]
  remove: []
  copy: []
  insert: []
}>()
const { t } = useI18n()

type FieldKind = 'count' | 'weight' | 'text' | 'checkbox' | 'phone' | 'amount'
const KIND_ICONS: Record<FieldKind, string> = {
  count: 'i-lucide-hash',
  weight: 'i-lucide-weight',
  text: 'i-lucide-type',
  checkbox: 'i-lucide-square-check',
  phone: 'i-lucide-phone',
  amount: 'i-lucide-banknote',
}
const kind = computed<FieldKind>(() => {
  const { field } = props
  if (field.type === 'number') return field.unit === 'kg' ? 'weight' : 'count'
  return field.type === 'textField' ? 'text' : field.type
})
const placeholder = computed(() => `{{${fieldPlaceholder(props.field)}}}`)
const used = computed(() => props.placement === 'placed')

/** Required for staff, and for the printout unless the field is portal-only (`field-flags`). */
const required = computed(() => requiredState(props.field))
const portalOnly = computed(() => Boolean(props.field.portalOnly))
const requiredHint = computed(() => t(portalOnly.value ? 'studio.html.requiredPortalOnly' : 'studio.html.required'))
function toggleRequired() {
  emit('update', requiredPatch(props.field, required.value !== true))
}
/** Publish needs the HTML to print it (`missingPrintBinding`). */
const printRequired = computed(() => 'printRequired' in props.field && Boolean(props.field.printRequired))

type Status = FieldPlacement | 'missingRequired'
const STATUS: Record<Status, { icon: string, color: 'success' | 'warning' | 'error' | 'neutral' }> = {
  placed: { icon: 'i-lucide-circle-check', color: 'success' },
  unplaced: { icon: 'i-lucide-circle-dashed', color: 'warning' },
  // Publish stops on it (`missingPrintBinding`), so it reads as an error before then.
  missingRequired: { icon: 'i-lucide-circle-alert', color: 'error' },
  portalOnly: { icon: 'i-lucide-monitor-smartphone', color: 'neutral' },
}
const status = computed<Status>(() => props.placement === 'unplaced' && printRequired.value ? 'missingRequired' : props.placement)
const portalOnlyHint = computed(() => t(props.placement === 'portalOnly' ? 'studio.html.placement.unmarkPortalOnly' : 'studio.html.placement.markPortalOnly'))

const removeHint = computed(() => props.builtIn ? t('studio.html.builtInHint') : used.value ? t('studio.html.usedHint', { placeholder: placeholder.value }) : t('studio.html.removeField'))
</script>

<template>
  <li
    class="rounded-lg border border-default bg-default p-2 transition-colors focus-within:border-primary hover:border-accented"
    :data-testid="`field-${field.id}`"
  >
    <div class="flex items-center gap-2">
      <span
        class="flex size-7 shrink-0 items-center justify-center rounded-md bg-elevated"
        :title="t(`studio.html.fieldType.${kind}`)"
      >
        <UIcon
          :name="KIND_ICONS[kind]"
          class="size-4 text-muted"
          :aria-label="t(`studio.html.fieldType.${kind}`)"
        />
      </span>
      <UInput
        :model-value="field.label"
        :disabled="readOnly"
        size="sm"
        variant="ghost"
        class="min-w-0 flex-1"
        :ui="{ base: 'font-medium' }"
        :placeholder="t('studio.html.fieldLabel')"
        :aria-label="t('studio.html.fieldLabel')"
        @change="emit('update', { label: ($event.target as HTMLInputElement).value })"
      />
      <div class="flex shrink-0 items-center">
        <UTooltip
          v-if="!builtIn"
          :text="requiredHint"
        >
          <UButton
            icon="i-lucide-asterisk"
            :color="required === true ? 'primary' : 'neutral'"
            :variant="required === true ? 'soft' : 'ghost'"
            size="xs"
            :disabled="readOnly"
            :aria-label="requiredHint"
            :aria-pressed="required"
            :data-testid="`required-${field.id}`"
            @click="toggleRequired"
          />
        </UTooltip>
        <UTooltip :text="t('studio.html.copyPlaceholder', { placeholder })">
          <UButton
            icon="i-lucide-copy"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="t('studio.html.copyPlaceholderFor', { placeholder, field: field.label || field.id })"
            :data-testid="`copy-${field.id}`"
            @click="emit('copy')"
          />
        </UTooltip>
        <UTooltip
          v-if="!readOnly"
          :text="removeHint"
        >
          <!-- A span, so the tooltip still shows on a disabled button. -->
          <span class="inline-flex">
            <UButton
              :icon="builtIn ? 'i-lucide-lock' : 'i-lucide-trash-2'"
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="builtIn || used"
              :aria-label="removeHint"
              :data-testid="`remove-${field.id}`"
              @click="emit('remove')"
            />
          </span>
        </UTooltip>
      </div>
    </div>
    <!-- On the slip: placed, not placed, or portal-only, with what to do next. -->
    <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-default pt-1.5 ps-9">
      <UBadge
        :icon="STATUS[status].icon"
        :color="STATUS[status].color"
        :label="t(`studio.html.placement.${status}`)"
        variant="subtle"
        size="sm"
        :data-testid="`placement-${field.id}`"
      />
      <span class="me-auto" />
      <UTooltip
        v-if="!readOnly && placement !== 'placed'"
        :text="t('studio.html.placement.insertHint')"
      >
        <UButton
          :label="t('studio.html.placement.insert')"
          :aria-label="t('studio.html.placement.insertFor', { placeholder, field: field.label || field.id })"
          icon="i-lucide-text-cursor-input"
          color="neutral"
          variant="ghost"
          size="xs"
          :data-testid="`insert-${field.id}`"
          @click="emit('insert')"
        />
      </UTooltip>
      <!-- Keep off the slip / Print on the slip: an intentionally portal-only field; a required one stays required for staff. -->
      <UTooltip
        v-if="!readOnly && placement !== 'placed'"
        :text="portalOnlyHint"
      >
        <UButton
          :icon="placement === 'portalOnly' ? 'i-lucide-printer' : 'i-lucide-eye-off'"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="`${portalOnlyHint}: ${field.label || field.id}`"
          :data-testid="`portal-only-${field.id}`"
          @click="emit('update', portalOnlyPatch(field, placement !== 'portalOnly'))"
        />
      </UTooltip>
    </div>
  </li>
</template>
