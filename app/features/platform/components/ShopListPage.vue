<script setup lang="ts">
/** The platform's shops (spec §4): status tabs, search, pages, all in the URL (page-patterns → Resource index). */
import type { Page } from '#shared/contracts/common'
import type { PlatformShop } from '#shared/contracts/platform-shops'

const { t, locale } = useI18n()
const { can } = useSession()
const { filters, page, pageSize, query } = usePaginatedQuery({ status: '', search: '' })
const search = ref(filters.search)
// Typing settles before it searches, so each key press isn't a request.
let typing: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(typing)
  typing = setTimeout(() => {
    filters.search = value.trim()
  }, 300)
})
onBeforeUnmount(() => clearTimeout(typing))
watch(() => filters.search, (value) => {
  if (value !== search.value.trim()) search.value = value
})

const shops = useApiQuery('platform:shops', () => apiFetch<Page<PlatformShop>>('/platform/shops', { query: query.value }), { watch: [query] })

const tabs = computed(() => [
  { label: t('platform.shops.tabs.all'), value: '' },
  { label: t('platform.shops.tabs.active'), value: 'active' },
  { label: t('platform.shops.tabs.suspended'), value: 'suspended' },
])
const filtered = computed(() => Boolean(filters.search || filters.status))
function clearFilters() {
  search.value = ''
  filters.search = ''
  filters.status = ''
}
</script>

<template>
  <UDashboardPanel id="platform-shops">
    <template #header>
      <UDashboardNavbar :title="t('platform.shops.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            v-if="can('shop:create')"
            :label="t('platform.shops.new')"
            icon="i-lucide-plus"
            to="/platform/shops/new"
          />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <UInput
          v-model="search"
          :placeholder="t('platform.shops.search')"
          :aria-label="t('platform.shops.search')"
          icon="i-lucide-search"
          type="search"
          class="w-full sm:max-w-xs"
        />
      </UDashboardToolbar>
    </template>

    <template #body>
      <UTabs
        v-model="filters.status"
        :items="tabs"
        :content="false"
        variant="link"
        class="w-full"
      />

      <PageLoadError
        v-if="shops.error.value && !shops.data.value"
        :error="shops.error.value"
        @retry="shops.refresh()"
      />
      <div
        v-else-if="shops.loading.value"
        class="space-y-2"
      >
        <USkeleton
          v-for="n in 4"
          :key="n"
          class="h-16 w-full"
        />
      </div>
      <UEmpty
        v-else-if="!shops.data.value?.items.length"
        icon="i-lucide-store"
        :title="filtered ? t('platform.shops.noMatch') : t('platform.shops.empty')"
        :description="filtered ? undefined : t('platform.shops.emptyDescription')"
        :actions="filtered
          ? [{ label: t('common.actions.clearFilters'), color: 'neutral', variant: 'outline', onClick: clearFilters }]
          : can('shop:create') ? [{ label: t('platform.shops.new'), icon: 'i-lucide-plus', to: '/platform/shops/new' }] : []"
      />
      <template v-else>
        <ul
          class="divide-y divide-default rounded-md border border-default"
          :class="{ 'opacity-60': shops.refreshing.value }"
        >
          <li
            v-for="shop in shops.data.value.items"
            :key="shop.id"
          >
            <NuxtLink
              :to="`/platform/shops/${shop.id}`"
              class="flex items-start justify-between gap-3 px-4 py-3 hover:bg-elevated/50 focus-visible:outline-2 focus-visible:outline-primary"
            >
              <div class="min-w-0 space-y-0.5">
                <p class="font-medium break-words">
                  {{ shop.name }}
                </p>
                <p class="text-sm text-muted break-words">
                  {{ shop.slug }} · {{ shop.owner ? t('platform.shops.owner', { username: shop.owner.username }) : t('platform.shops.noOwner') }}
                </p>
                <p class="text-xs text-muted">
                  {{ t('platform.shops.created', { date: formatDate(shop.createdAt, locale) }) }}
                </p>
              </div>
              <UBadge
                :label="t(`platform.status.${shop.status}`)"
                :color="shop.status === 'active' ? 'success' : 'warning'"
                variant="subtle"
                class="shrink-0"
              />
            </NuxtLink>
          </li>
        </ul>
        <div
          v-if="shops.data.value.total > pageSize"
          class="flex justify-center"
        >
          <UPagination
            v-model:page="page"
            :total="shops.data.value.total"
            :items-per-page="pageSize"
          />
        </div>
      </template>
    </template>
  </UDashboardPanel>
</template>
