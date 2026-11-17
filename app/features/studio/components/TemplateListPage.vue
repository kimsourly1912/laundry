<script setup lang="ts">
/** The platform's templates (plan §5.2, step 2 adds thumbnails and attached shops): status tabs, search, pages in the URL. */
import type { Page } from '#shared/contracts/common'
import type { TemplateListItem } from '#shared/contracts/templates'
import { sampleData } from '#shared/slip/fields'
import { SlipSvg, useSlipText } from '~/features/slip-fill'
import NewTemplateModal from './NewTemplateModal.vue'

const { t } = useI18n()
const { can } = useSession()
const { filters, page, pageSize, query } = usePaginatedQuery({ status: '', search: '' })
const search = ref(filters.search)
let typing: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(typing)
  typing = setTimeout(() => {
    filters.search = value.trim()
  }, 300)
})
onBeforeUnmount(() => clearTimeout(typing))

const templates = useApiQuery('studio:templates', () => apiFetch<Page<TemplateListItem>>('/platform/templates', { query: query.value }), { watch: [query] })
const creating = ref(false)
// Thumbnails: each template's draft drawn by the shared builder, with sample values.
const { text } = useSlipText()
const today = new Date().toISOString().slice(0, 10)

const tabs = computed(() => [
  { label: t('studio.list.tabs.current'), value: '' },
  { label: t('studio.status.draft'), value: 'draft' },
  { label: t('studio.status.published'), value: 'published' },
  { label: t('studio.status.archived'), value: 'archived' },
])
const filtered = computed(() => Boolean(filters.search || filters.status))
function clearFilters() {
  search.value = ''
  filters.search = ''
  filters.status = ''
}
</script>

<template>
  <UDashboardPanel id="platform-templates">
    <template #header>
      <UDashboardNavbar :title="t('studio.list.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            v-if="can('template:write')"
            :label="t('studio.new.title')"
            icon="i-lucide-plus"
            @click="creating = true"
          />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <UInput
          v-model="search"
          :placeholder="t('studio.list.search')"
          :aria-label="t('studio.list.search')"
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
        v-if="templates.error.value && !templates.data.value"
        :error="templates.error.value"
        @retry="templates.refresh()"
      />
      <div
        v-else-if="templates.loading.value"
        class="space-y-2"
      >
        <USkeleton
          v-for="n in 4"
          :key="n"
          class="h-16 w-full"
        />
      </div>
      <UEmpty
        v-else-if="!templates.data.value?.items.length"
        icon="i-lucide-file-image"
        :title="filtered ? t('studio.list.noMatch') : t('studio.list.empty')"
        :description="filtered ? undefined : t('studio.list.emptyDescription')"
        :actions="filtered
          ? [{ label: t('common.actions.clearFilters'), color: 'neutral', variant: 'outline', onClick: clearFilters }]
          : can('template:write') ? [{ label: t('studio.new.title'), icon: 'i-lucide-plus', onClick: () => { creating = true } }] : []"
      />
      <template v-else>
        <ul
          class="divide-y divide-default rounded-md border border-default"
          :class="{ 'opacity-60': templates.refreshing.value }"
        >
          <li
            v-for="template in templates.data.value.items"
            :key="template.id"
          >
            <NuxtLink
              :to="`/platform/templates/${template.id}`"
              class="flex items-start justify-between gap-3 px-4 py-3 hover:bg-elevated/50 focus-visible:outline-2 focus-visible:outline-primary"
            >
              <div
                class="w-28 shrink-0 overflow-hidden rounded border border-default bg-white"
                :style="{ aspectRatio: `${template.width} / ${template.height}` }"
                aria-hidden="true"
              >
                <SlipSvg
                  v-if="text"
                  :design="template.design"
                  :data="sampleData(template.design, { date: today })"
                  :text="text"
                  :id-prefix="`thumb-${template.id}-`"
                />
              </div>
              <div class="min-w-0 flex-1 space-y-0.5">
                <p class="font-medium break-words">
                  {{ template.name }}
                </p>
                <p class="text-sm text-muted">
                  {{ template.width }} × {{ template.height }} px · {{ template.latestVersion ? t('studio.list.version', { number: template.latestVersion }) : t('studio.list.neverPublished') }} · {{ t('studio.list.shops', template.shopCount) }}
                </p>
                <p class="text-xs text-muted">
                  {{ t('studio.list.updated', { date: formatDate(template.updatedAt) }) }}
                </p>
              </div>
              <UBadge
                :label="t(`studio.status.${template.status}`)"
                :color="template.status === 'published' ? 'success' : 'neutral'"
                variant="subtle"
                class="shrink-0"
              />
            </NuxtLink>
          </li>
        </ul>
        <div
          v-if="templates.data.value.total > pageSize"
          class="flex justify-center"
        >
          <UPagination
            v-model:page="page"
            :total="templates.data.value.total"
            :items-per-page="pageSize"
          />
        </div>
      </template>
    </template>
  </UDashboardPanel>

  <NewTemplateModal v-model:open="creating" />
</template>
