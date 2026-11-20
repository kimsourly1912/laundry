<script setup lang="ts">
/**
 * Add from list (D42): the laundry item list by group, with a search. Items the slip already has
 * show ticked and can't be picked again; a weight and a service tick say which they are, as "Wash &
 * iron" is both. Each item adds a quantity or a tick with no price (manual total, D44); Add hands the picked items back in the list's order, and
 * the page turns each into its intake field.
 */
import type { SlipElement } from '#shared/contracts/slip-design'
import type { IntakeItem } from '#shared/html-slip/items'
import { hasIntakeItem, INTAKE_GROUPS, INTAKE_ITEMS } from '#shared/html-slip/items'

const props = defineProps<{ elements: readonly SlipElement[], room: number }>()
const emit = defineEmits<{ add: [items: IntakeItem[]] }>()
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()

const search = ref('')
const picked = ref(new Set<string>())
watch(open, (value) => {
  if (!value) return
  search.value = ''
  picked.value = new Set()
})

const onSlip = (item: IntakeItem) => hasIntakeItem(props.elements, item)
const groups = computed(() => {
  const query = search.value.trim().toLowerCase()
  return INTAKE_GROUPS
    .map(group => ({ group, items: INTAKE_ITEMS.filter(item => item.group === group && (!query || item.label.toLowerCase().includes(query))) }))
    .filter(({ items }) => items.length)
})

function toggle(item: IntakeItem, on: boolean) {
  const next = new Set(picked.value)
  if (on) next.add(item.key)
  else next.delete(item.key)
  picked.value = next
}
const tooMany = computed(() => picked.value.size > props.room)

function add() {
  if (!picked.value.size || tooMany.value) return
  emit('add', INTAKE_ITEMS.filter(item => picked.value.has(item.key)))
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('studio.html.itemList.title')"
    :description="t('studio.html.itemList.description')"
    :ui="{ content: 'sm:max-w-2xl', footer: 'justify-end' }"
  >
    <template #body>
      <div class="space-y-4">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          :placeholder="t('studio.html.itemList.search')"
          :aria-label="t('studio.html.itemList.search')"
          class="w-full"
          data-testid="item-search"
        />
        <p
          v-if="!groups.length"
          class="py-6 text-center text-sm text-muted"
        >
          {{ t('studio.html.itemList.empty') }}
        </p>
        <section
          v-for="{ group, items } in groups"
          :key="group"
          class="space-y-2"
        >
          <h3 class="text-sm font-semibold text-highlighted">
            {{ t(`studio.html.itemList.groups.${group}`) }}
          </h3>
          <ul class="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <li
              v-for="item in items"
              :key="item.key"
            >
              <UCheckbox
                :model-value="onSlip(item) || picked.has(item.key)"
                :disabled="onSlip(item)"
                :label="item.label"
                :description="item.kind === 'weight' ? t('studio.html.itemList.perKg') : item.kind === 'checkbox' ? t('studio.html.itemList.tick') : undefined"
                :data-testid="`item-${item.key}`"
                @update:model-value="toggle(item, $event === true)"
              />
            </li>
          </ul>
        </section>
      </div>
    </template>

    <template #footer>
      <p
        v-if="tooMany"
        class="me-auto text-sm text-error"
      >
        {{ t('studio.html.itemList.tooMany', { count: room }) }}
      </p>
      <UButton
        :label="t('common.actions.cancel')"
        color="neutral"
        variant="outline"
        @click="open = false"
      />
      <UButton
        :label="t('studio.html.itemList.add', { count: picked.size }, picked.size)"
        :disabled="!picked.size || tooMany"
        data-testid="item-add"
        @click="add"
      />
    </template>
  </UModal>
</template>
