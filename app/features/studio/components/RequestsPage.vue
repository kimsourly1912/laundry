<script setup lang="ts">
/**
 * Redesign requests (D39; guide → sheet 09: "the request queue is its own link"): owners' photos
 * of their paper slips with what they want, oldest first, by status. The platform starts one, marks
 * it done naming the template it made (then attaches it to the shop, step 2), or declines it.
 */
import type { Page } from '#shared/contracts/common'
import type { PlatformTemplateRequest, RequestStatus } from '#shared/contracts/template-requests'
import type { TemplateListItem } from '#shared/contracts/templates'

const { t, te } = useI18n()
const { can } = useSession()
const { filters, page, pageSize, query } = usePaginatedQuery({ status: 'new' })
const requests = useApiQuery('studio:requests', () => apiFetch<Page<PlatformTemplateRequest>>('/platform/template-requests', { query: query.value }), { watch: [query] })
const templates = useApiQuery('studio:request-templates', () => apiFetch<Page<TemplateListItem>>('/platform/templates', { query: { pageSize: 100 } }))
const STATUSES: RequestStatus[] = ['new', 'in_progress', 'done', 'declined']
const COLORS = { new: 'info', in_progress: 'warning', done: 'success', declined: 'neutral' } as const
const tabs = computed(() => STATUSES.map(status => ({ label: t(`studio.requests.status.${status}`), value: status })))

const open = shallowRef<PlatformTemplateRequest>()
const templateId = ref<string>()
function show(request: PlatformTemplateRequest) {
  open.value = request
  templateId.value = request.templateId ?? undefined
}
const move = useMutation((status: RequestStatus) => apiFetch<PlatformTemplateRequest>(`/platform/template-requests/${open.value!.id}/status`, {
  method: 'POST',
  body: { version: open.value!.version, status, templateId: status === 'done' ? templateId.value ?? null : open.value!.templateId },
}), { inline: true, invalidate: ['studio'] })
const failure = computed(() => (move.error.value ? errorText(move.error.value, t, te) : undefined))
async function setStatus(status: RequestStatus) {
  const result = await move.execute(status)
  if (result.ok) open.value = undefined
}
</script>

<template>
  <UDashboardPanel id="template-requests">
    <template #header>
      <UDashboardNavbar :title="t('studio.requests.title')">
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            to="/platform/templates"
            :aria-label="t('common.actions.back')"
          />
        </template>
      </UDashboardNavbar>
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
        v-if="requests.error.value && !requests.data.value"
        :error="requests.error.value"
        @retry="requests.refresh()"
      />
      <USkeleton
        v-else-if="requests.loading.value"
        class="h-24 w-full"
      />
      <UEmpty
        v-else-if="!requests.data.value?.items.length"
        icon="i-lucide-inbox"
        :title="t('studio.requests.empty')"
      />
      <ul
        v-else-if="requests.data.value"
        class="divide-y divide-default rounded-md border border-default"
        data-testid="requests-list"
      >
        <li
          v-for="request in requests.data.value.items"
          :key="request.id"
        >
          <button
            type="button"
            class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-elevated/50 focus-visible:outline-2 focus-visible:outline-primary"
            @click="show(request)"
          >
            <img
              :src="`/api/platform/template-requests/${request.id}/photo`"
              :alt="t('studio.requests.photoOf', { shop: request.shopName })"
              class="size-14 shrink-0 rounded border border-default object-cover"
              loading="lazy"
            >
            <span class="min-w-0 flex-1">
              <span class="block font-medium break-words">{{ request.shopName }}</span>
              <span class="block text-sm text-muted">{{ t(`studio.requests.kind.${request.kind}`) }} · {{ formatDate(request.createdAt) }}</span>
            </span>
            <UBadge
              :label="t(`studio.requests.status.${request.status}`)"
              :color="COLORS[request.status]"
              variant="subtle"
            />
          </button>
        </li>
      </ul>
      <div
        v-if="(requests.data.value?.total ?? 0) > pageSize"
        class="flex justify-center"
      >
        <UPagination
          v-model:page="page"
          :total="requests.data.value!.total"
          :items-per-page="pageSize"
        />
      </div>

      <UModal
        :open="Boolean(open)"
        :title="open ? t('studio.requests.from', { shop: open.shopName }) : ''"
        :description="open ? t(`studio.requests.kind.${open.kind}`) : ''"
        @update:open="value => { if (!value) open = undefined }"
      >
        <template #body>
          <div
            v-if="open"
            class="space-y-3"
          >
            <UAlert
              v-if="failure"
              color="error"
              variant="subtle"
              :title="failure"
            />
            <a
              :href="`/api/platform/template-requests/${open.id}/photo`"
              target="_blank"
              rel="noopener"
            >
              <img
                :src="`/api/platform/template-requests/${open.id}/photo`"
                :alt="t('studio.requests.photoOf', { shop: open.shopName })"
                class="max-h-80 w-full rounded border border-default object-contain"
              >
            </a>
            <p class="text-sm whitespace-pre-line">
              {{ open.notes || t('studio.requests.noNotes') }}
            </p>
            <p class="text-xs text-muted">
              {{ open.photo.width }} × {{ open.photo.height }} px
            </p>
            <UFormField
              v-if="can('template:write')"
              :label="t('studio.requests.madeTemplate')"
            >
              <USelect
                v-model="templateId"
                :items="(templates.data.value?.items ?? []).map(item => ({ label: item.name, value: item.id }))"
                :placeholder="t('studio.requests.chooseTemplate')"
                class="w-full"
              />
            </UFormField>
          </div>
        </template>
        <template #footer>
          <div
            v-if="open && can('template:write')"
            class="flex w-full flex-wrap justify-end gap-2"
          >
            <UButton
              v-if="open.status !== 'declined'"
              :label="t('studio.requests.decline')"
              color="neutral"
              variant="ghost"
              :loading="move.pending.value"
              @click="setStatus('declined')"
            />
            <UButton
              v-if="open.status === 'new'"
              :label="t('studio.requests.start')"
              color="neutral"
              variant="outline"
              :loading="move.pending.value"
              @click="setStatus('in_progress')"
            />
            <UButton
              :label="t('studio.requests.done')"
              :loading="move.pending.value"
              data-testid="request-done"
              @click="setStatus('done')"
            />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
