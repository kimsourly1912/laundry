<script setup lang="ts">
/**
 * Paper slips (plan §3 "Templates", §4; implementation guide → sheet 05): the published templates
 * the platform attached to this shop, each with a sample preview. The owner makes one the default
 * (New order starts on it) or uses one for a single order. Only the platform changes a template.
 */
import type { OrderTemplate } from '#shared/contracts/orders'
import { sampleData } from '#shared/slip/fields'
import { SlipSvg, useSlipText } from '~/features/slip-fill'
import { useShopSettings } from '~/features/shop-settings'
import { useOrderTemplates } from '../composables/useOrderTemplates'
import type { TemplateRequest } from '#shared/contracts/template-requests'
import { shopToday } from '../utils/order-form'
import RequestModal from './RequestModal.vue'

const { t } = useI18n()
const { can } = useSession()
const { supportUrl } = useRuntimeConfig().public
const templates = useOrderTemplates()
const settings = useShopSettings()
const slipText = useSlipText()

const shop = computed(() => {
  const value = settings.data.value
  return value && { name: value.name, phone: value.phone, address: value.address, logoImageId: null, currency: value.currency }
})
const today = shopToday()

const makeDefault = useMutation((templateId: string) => apiFetch<OrderTemplate[]>(`/shop/templates/${templateId}/default`, { method: 'POST' }), {
  invalidate: ['orders'],
  success: () => t('orders.slips.defaultSaved'),
})
// D39: the owner asks the platform for a new design or a change.
const requests = useApiQuery('orders:requests', () => (can('template:request') ? apiFetch<TemplateRequest[]>('/shop/template-requests') : Promise.resolve([] as TemplateRequest[])))
const asking = ref(false)
const REQUEST_COLORS = { new: 'info', in_progress: 'warning', done: 'success', declined: 'neutral' } as const

async function choose(templateId: string) {
  const result = await makeDefault.execute(templateId)
  if (result.ok) templates.data.value = result.data
}
</script>

<template>
  <UDashboardPanel id="paper-slips">
    <template #header>
      <UDashboardNavbar :title="t('orders.slips.title')">
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            to="/more"
            :aria-label="t('common.actions.back')"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-page space-y-4">
        <p class="text-sm text-muted">
          {{ t('orders.slips.intro') }}
        </p>
        <UButton
          v-if="can('template:request')"
          :label="t('orders.requests.ask')"
          icon="i-lucide-message-square-plus"
          color="neutral"
          variant="outline"
          data-testid="ask-design"
          @click="asking = true"
        />
        <section
          v-if="requests.data.value?.length"
          class="space-y-2"
          aria-labelledby="my-requests"
        >
          <h2
            id="my-requests"
            class="font-semibold text-highlighted"
          >
            {{ t('orders.requests.mine') }}
          </h2>
          <ul
            class="divide-y divide-default rounded-md border border-default"
            data-testid="my-requests"
          >
            <li
              v-for="request in requests.data.value"
              :key="request.id"
              class="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div class="min-w-0">
                <p class="font-medium">
                  {{ t(`orders.requests.${request.kind}`) }}
                </p>
                <p class="text-sm text-muted">
                  {{ formatDate(request.createdAt) }}<template v-if="request.notes">
                    · <span class="break-words">{{ request.notes }}</span>
                  </template>
                </p>
              </div>
              <UBadge
                :label="t(`orders.requests.status.${request.status}`)"
                :color="REQUEST_COLORS[request.status]"
                variant="subtle"
              />
            </li>
          </ul>
        </section>
        <RequestModal
          v-model:open="asking"
          @sent="() => requests.refresh()"
        />
        <PageLoadError
          v-if="(templates.error.value && !templates.data.value) || (settings.error.value && !settings.data.value)"
          :error="templates.error.value ?? settings.error.value"
          @retry="templates.refresh(); settings.refresh()"
        />
        <div
          v-else-if="!templates.data.value || !shop"
          class="space-y-3"
        >
          <USkeleton
            v-for="n in 2"
            :key="n"
            class="aspect-[3/2] w-full"
          />
        </div>
        <UEmpty
          v-else-if="!templates.data.value.length"
          icon="i-lucide-file-x"
          :title="t('orders.new.noSlipTitle')"
          :description="t('orders.new.noSlipDescription')"
          :actions="supportUrl ? [{ label: t('more.contactSupport'), icon: 'i-lucide-message-circle', to: supportUrl, target: '_blank', external: true }] : []"
        />
        <ul
          v-else
          class="space-y-4"
          data-testid="paper-slips"
        >
          <li
            v-for="template in templates.data.value"
            :key="template.templateId"
            class="space-y-3 rounded-md border border-default p-4"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="min-w-0 font-semibold break-words text-highlighted">
                {{ template.name }}
              </h2>
              <UBadge
                v-if="template.isDefault"
                :label="t('orders.slips.default')"
                color="primary"
                variant="subtle"
                data-testid="default-badge"
              />
            </div>
            <div
              class="w-full overflow-hidden rounded border border-default bg-white"
              :style="{ aspectRatio: `${template.design.width} / ${template.design.height}` }"
              role="img"
              :aria-label="t('orders.slips.sample', { name: template.name })"
            >
              <SlipSvg
                v-if="slipText.text.value"
                :design="template.design"
                :data="sampleData(template.design, { shop, date: today })"
                :text="slipText.text.value"
                :image-href="imageId => `/api/shop/templates/${template.templateId}/images/${imageId}`"
                :id-prefix="`slip-${template.templateId}-`"
              />
            </div>
            <p class="text-xs text-muted">
              {{ t('orders.slips.sampleNote') }}
            </p>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-if="can('order:create')"
                :label="t('orders.slips.use')"
                icon="i-lucide-plus"
                color="neutral"
                variant="outline"
                :to="{ path: '/orders/new', query: { template: template.templateId } }"
              />
              <UButton
                v-if="!template.isDefault && can('template:set-default')"
                :label="t('orders.slips.makeDefault')"
                icon="i-lucide-star"
                :loading="makeDefault.pending.value"
                :data-testid="`make-default-${template.name}`"
                @click="choose(template.templateId)"
              />
            </div>
          </li>
        </ul>
      </div>
    </template>
  </UDashboardPanel>
</template>
