<script setup lang="ts">
/**
 * The price list (spec §4 → settings pattern): each service type with its items and prices, in
 * the shop's currency. Archived entries on their own tab. Edits open their own page (Back works).
 */
import type { PriceStatus } from '#shared/contracts/pricing'
import { useShopSettings } from '~/features/shop-settings'
import { usePriceItems, useServiceTypes } from '../composables/usePriceList'

const { t, locale } = useI18n()
const { can } = useSession()
const route = useRoute()
const router = useRouter()
const status = computed<PriceStatus>({
  get: () => (route.query.status === 'archived' ? 'archived' : 'active'),
  set: value => router.replace({ query: value === 'active' ? {} : { status: value } }),
})
const settings = useShopSettings()
// Items are grouped under every service type, archived ones included, so an item stays findable.
const types = useServiceTypes('active')
const archivedTypes = useServiceTypes('archived')
const items = usePriceItems(status)

const currency = computed(() => settings.data.value?.currency ?? 'KHR')
const loading = computed(() => types.loading.value || archivedTypes.loading.value || items.loading.value || settings.loading.value)
const error = computed(() => types.error.value ?? archivedTypes.error.value ?? items.error.value ?? settings.error.value)
function retry() {
  void types.refresh()
  void archivedTypes.refresh()
  void items.refresh()
  void settings.refresh()
}

const groups = computed(() => {
  const allTypes = [...(types.data.value?.items ?? []), ...(archivedTypes.data.value?.items ?? [])]
  const list = items.data.value?.items ?? []
  const shown = status.value === 'active' ? (types.data.value?.items ?? []) : allTypes.filter(type => type.status === 'archived' || list.some(item => item.serviceTypeId === type.id))
  return shown.map(type => ({ type, items: list.filter(item => item.serviceTypeId === type.id) }))
})
const empty = computed(() => !groups.value.length)
const tabs = computed(() => [
  { label: t('pricing.tabs.active'), value: 'active' },
  { label: t('pricing.tabs.archived'), value: 'archived' },
])
const writable = computed(() => can('price:write'))
</script>

<template>
  <UDashboardPanel id="prices">
    <template #header>
      <UDashboardNavbar :title="t('pricing.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            v-if="writable"
            :label="t('pricing.newItem')"
            icon="i-lucide-plus"
            to="/prices/items/new"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UTabs
        v-model="status"
        :items="tabs"
        :content="false"
        variant="link"
        class="w-full"
      />

      <PageLoadError
        v-if="error && !items.data.value"
        :error="error"
        @retry="retry"
      />
      <div
        v-else-if="loading"
        class="space-y-3"
      >
        <USkeleton
          v-for="n in 3"
          :key="n"
          class="h-28 w-full"
        />
      </div>
      <UEmpty
        v-else-if="empty"
        icon="i-lucide-tags"
        :title="status === 'active' ? t('pricing.empty') : t('pricing.emptyArchived')"
        :description="status === 'active' ? t('pricing.emptyDescription') : undefined"
        :actions="status === 'active' && writable ? [{ label: t('pricing.newServiceType'), icon: 'i-lucide-plus', to: '/prices/types/new' }] : []"
      />
      <template v-else>
        <section
          v-for="group in groups"
          :key="group.type.id"
          class="rounded-md border border-default"
          :aria-labelledby="`type-${group.type.id}`"
        >
          <header class="flex items-center justify-between gap-3 border-b border-default px-4 py-2">
            <h2
              :id="`type-${group.type.id}`"
              class="font-semibold break-words"
            >
              {{ localName(group.type, locale) }}
              <UBadge
                v-if="group.type.status === 'archived'"
                :label="t('pricing.archived')"
                color="neutral"
                variant="subtle"
                class="ms-2"
              />
            </h2>
            <UButton
              v-if="writable && group.type.status === 'active'"
              :to="`/prices/types/${group.type.id}`"
              :label="t('pricing.editServiceType')"
              :aria-label="t('pricing.editServiceTypeNamed', { name: localName(group.type, locale) })"
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              size="sm"
            />
          </header>
          <ul
            v-if="group.items.length"
            class="divide-y divide-default"
          >
            <li
              v-for="item in group.items"
              :key="item.id"
            >
              <component
                :is="writable && item.status === 'active' ? 'NuxtLink' : 'div'"
                :to="writable && item.status === 'active' ? `/prices/items/${item.id}` : undefined"
                class="flex items-center justify-between gap-3 px-4 py-3"
                :class="{ 'hover:bg-elevated/50': writable && item.status === 'active' }"
              >
                <span class="min-w-0 break-words">{{ localName(item, locale) }}</span>
                <span class="shrink-0 tabular-nums">
                  {{ formatMoney(item.price, currency, locale) }}<span class="text-muted"> / {{ t(`pricing.units.${item.unit}`) }}</span>
                </span>
              </component>
            </li>
          </ul>
          <p
            v-else
            class="px-4 py-3 text-sm text-muted"
          >
            {{ t('pricing.noItems') }}
          </p>
        </section>
        <div
          v-if="writable && status === 'active'"
          class="flex justify-start"
        >
          <UButton
            :label="t('pricing.newServiceType')"
            icon="i-lucide-plus"
            color="neutral"
            variant="outline"
            to="/prices/types/new"
          />
        </div>
      </template>
    </template>
  </UDashboardPanel>
</template>
