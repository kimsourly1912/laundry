<script setup lang="ts">
/**
 * Slip templates (D25): the ready-made price lists picked when creating a shop. Active or archived
 * (page-patterns → Resource index); the list is always whole, so there are no pages.
 */
import type { TemplateList } from '#shared/contracts/templates'

const { t, locale } = useI18n()
const { can } = useSession()
const route = useRoute()
const router = useRouter()
const status = computed({
  get: () => (route.query.status === 'archived' ? 'archived' : 'active'),
  set: value => router.replace({ query: value === 'archived' ? { status: value } : {} }),
})

const templates = useApiQuery(() => `platform:templates:${status.value}`, () => apiFetch<TemplateList>('/platform/templates', { query: { status: status.value } }), { watch: [status] })

const tabs = computed(() => [
  { label: t('platform.templates.tabs.active'), value: 'active' },
  { label: t('platform.templates.tabs.archived'), value: 'archived' },
])
</script>

<template>
  <UDashboardPanel id="platform-templates">
    <template #header>
      <UDashboardNavbar :title="t('platform.templates.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            v-if="can('template:write')"
            :label="t('platform.templates.new')"
            icon="i-lucide-plus"
            to="/platform/templates/new"
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
        v-if="templates.error.value && !templates.data.value"
        :error="templates.error.value"
        @retry="templates.refresh()"
      />
      <div
        v-else-if="templates.loading.value"
        class="space-y-2"
      >
        <USkeleton
          v-for="n in 3"
          :key="n"
          class="h-16 w-full"
        />
      </div>
      <UEmpty
        v-else-if="!templates.data.value?.items.length"
        icon="i-lucide-layout-template"
        :title="status === 'archived' ? t('platform.templates.noArchived') : t('platform.templates.empty')"
        :description="status === 'archived' ? undefined : t('platform.templates.emptyDescription')"
        :actions="status === 'active' && can('template:write') ? [{ label: t('platform.templates.new'), icon: 'i-lucide-plus', to: '/platform/templates/new' }] : []"
      />
      <ul
        v-else
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
            <div class="min-w-0 space-y-0.5">
              <p class="font-medium break-words">
                {{ template.name }}
              </p>
              <p class="text-sm text-muted">
                {{ t('platform.templates.counts', { services: template.serviceCount, items: template.itemCount }) }}
              </p>
              <p class="text-xs text-muted">
                {{ t('platform.templates.updated', { date: formatDate(template.updatedAt, locale) }) }}
              </p>
            </div>
            <UBadge
              :label="t(`settings.currencies.${template.currency}`)"
              color="neutral"
              variant="subtle"
              class="shrink-0"
            />
          </NuxtLink>
        </li>
      </ul>
    </template>
  </UDashboardPanel>
</template>
