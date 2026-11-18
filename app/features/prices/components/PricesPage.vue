<script setup lang="ts">
/**
 * Prices (D39; product notes → price list; guide → sheet 06): what each item or service costs, per
 * piece or per kg. Slip counts linked to a key are priced from here; an order keeps the price it was
 * charged. Archive instead of delete.
 */
import type { PriceItem } from '#shared/contracts/prices'
import { useShopSettings } from '~/features/shop-settings'
import PriceModal from './PriceModal.vue'

const { t, te } = useI18n()
const { can } = useSession()
const prices = useApiQuery('prices:list', () => apiFetch<PriceItem[]>('/shop/prices'))
const settings = useShopSettings()
const currency = computed(() => settings.data.value?.currency ?? 'KHR')
const editing = ref<PriceItem | undefined>()
const open = ref(false)
function edit(item?: PriceItem) {
  editing.value = item
  open.value = true
}

const toggle = useMutation((item: PriceItem) => apiFetch<PriceItem>(`/shop/prices/${item.id}/${item.active ? 'archive' : 'restore'}`, { method: 'POST', body: { version: item.version } }), { inline: true, invalidate: ['prices', 'orders'] })
const failure = computed(() => (toggle.error.value ? errorText(toggle.error.value, t, te) : undefined))
const active = computed(() => (prices.data.value ?? []).filter(item => item.active))
const archived = computed(() => (prices.data.value ?? []).filter(item => !item.active))
</script>

<template>
  <UDashboardPanel id="prices">
    <template #header>
      <UDashboardNavbar :title="t('prices.title')">
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            to="/more"
            :aria-label="t('common.actions.back')"
          />
        </template>
        <template #right>
          <UButton
            v-if="can('price:write')"
            :label="t('prices.add')"
            icon="i-lucide-plus"
            data-testid="add-price"
            @click="edit()"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-page space-y-4">
        <p class="text-sm text-muted">
          {{ t('prices.intro') }}
        </p>
        <UAlert
          v-if="failure"
          color="error"
          variant="subtle"
          :title="failure"
          :actions="[{ label: t('common.actions.reload'), color: 'neutral', variant: 'outline', onClick: () => { toggle.reset(); prices.refresh() } }]"
        />
        <PageLoadError
          v-if="prices.error.value && !prices.data.value"
          :error="prices.error.value"
          @retry="prices.refresh()"
        />
        <USkeleton
          v-else-if="!prices.data.value"
          class="h-32 w-full"
        />
        <UEmpty
          v-else-if="!prices.data.value.length"
          icon="i-lucide-tags"
          :title="t('prices.emptyTitle')"
          :description="t('prices.emptyDescription')"
        />
        <template v-else>
          <ul
            v-for="(list, index) in [active, archived]"
            v-show="list.length"
            :key="index"
            class="divide-y divide-default rounded-md border border-default"
            :data-testid="index ? 'prices-archived' : 'prices-active'"
          >
            <li
              v-if="index"
              class="bg-elevated/50 px-4 py-2 text-sm font-medium text-muted"
            >
              {{ t('prices.archived') }}
            </li>
            <li
              v-for="item in list"
              :key="item.id"
              class="flex items-center gap-3 px-4 py-3"
            >
              <div class="min-w-0 flex-1">
                <p class="font-medium break-words text-highlighted">
                  {{ item.label }}
                </p>
                <p class="text-sm text-muted">
                  <code>{{ item.key }}</code> · {{ t(item.unit === 'kg' ? 'orders.form.perKg' : 'orders.form.each', { price: formatMoney(item.price, item.currency) }) }}
                </p>
              </div>
              <UDropdownMenu
                v-if="can('price:write')"
                :items="[[{ label: t('prices.edit'), icon: 'i-lucide-pencil', onSelect: () => edit(item) }, { label: item.active ? t('prices.archive') : t('prices.restore'), icon: item.active ? 'i-lucide-archive' : 'i-lucide-archive-restore', onSelect: () => toggle.execute(item) }]]"
              >
                <UButton
                  icon="i-lucide-ellipsis-vertical"
                  color="neutral"
                  variant="ghost"
                  :aria-label="t('prices.actionsFor', { label: item.label })"
                />
              </UDropdownMenu>
            </li>
          </ul>
        </template>
      </div>
      <PriceModal
        v-model:open="open"
        :item="editing"
        :currency="currency"
        @saved="() => prices.refresh()"
      />
    </template>
  </UDashboardPanel>
</template>
