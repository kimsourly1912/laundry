<script setup lang="ts">
/**
 * One intake field in the Studio's Intake fields view, as a card: its kind, label, Priced as for a
 * count or weight, Required, copy placeholder and remove. A built-in field (phone, amount) can't be
 * removed; a field the HTML prints can't be removed until the markup stops using it.
 */
import { FIELD_PREFIX } from '#shared/html-slip/catalog'
import type { OwnerField } from '#shared/slip/fields'
import PriceKeySelect from './PriceKeySelect.vue'

const props = defineProps<{ field: OwnerField, readOnly: boolean, builtIn: boolean, used: boolean }>()
const emit = defineEmits<{
  update: [patch: { label?: string, required?: boolean, printRequired?: boolean, priceKey?: string }]
  remove: []
  copy: []
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
const placeholder = computed(() => `{{${FIELD_PREFIX}${props.field.id}}}`)

/** One Required for both checks: staff must enter it, and the HTML must print it. */
const required = computed<boolean | 'mixed'>(() => {
  const onSlip = 'printRequired' in props.field && Boolean(props.field.printRequired)
  return props.field.required === onSlip ? onSlip : 'mixed'
})
function toggleRequired() {
  const next = required.value !== true
  emit('update', { required: next, printRequired: next })
}

const removeHint = computed(() => props.builtIn ? t('studio.html.builtInHint') : props.used ? t('studio.html.usedHint', { placeholder: placeholder.value }) : t('studio.html.removeField'))
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
          :text="t('studio.html.required')"
        >
          <UButton
            icon="i-lucide-asterisk"
            :color="required === true ? 'primary' : 'neutral'"
            :variant="required === true ? 'soft' : 'ghost'"
            size="xs"
            :disabled="readOnly"
            :aria-label="t('studio.html.required')"
            :aria-pressed="required"
            :data-testid="`required-${field.id}`"
            @click="toggleRequired"
          />
        </UTooltip>
        <UTooltip :text="placeholder">
          <UButton
            icon="i-lucide-braces"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="t('studio.html.copyPlaceholder', { placeholder })"
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
    <div
      v-if="field.type === 'number'"
      class="mt-1 flex items-center gap-2 border-t border-default pt-1.5 ps-9 text-xs text-muted"
    >
      <span class="shrink-0">{{ t('studio.field.priceKey') }}</span>
      <div class="min-w-0 flex-1">
        <PriceKeySelect
          :model-value="field.priceKey"
          :weight="field.unit === 'kg'"
          :disabled="readOnly"
          size="xs"
          variant="soft"
          :test-id="`price-key-${field.id}`"
          @update:model-value="emit('update', { priceKey: $event })"
        />
      </div>
    </div>
  </li>
</template>
