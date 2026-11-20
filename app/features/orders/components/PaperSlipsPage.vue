<script setup lang="ts">
import type { OrderTemplate } from '#shared/contracts/orders'
import { sampleData } from '#shared/slip/fields'
import { SlipSvg, useSlipText } from '~/features/slip-fill'
import { useShopSettings } from '~/features/shop-settings'
import { useOrderTemplates } from '../composables/useOrderTemplates'
import { shopToday } from '../utils/order-form'
import ServerSlip from './ServerSlip.vue'

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

/** The template being made the default, so only its button spins. */
const choosing = ref<string>()

async function choose(templateId: string) {
  choosing.value = templateId
  const result = await makeDefault.execute(templateId)
  choosing.value = undefined
  if (result.ok) templates.data.value = result.data
}
</script>

<template>
  <UDashboardPanel id="paper-slips">
    <template #header>
      <UDashboardNavbar
        :toggle="false"
        :title="t('orders.slips.title')"
      >
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
        <UAlert
          v-if="supportUrl"
          :title="t('orders.slips.changeTitle')"
          :description="t('orders.slips.changeDescription')"
          icon="i-lucide-message-circle"
          color="neutral"
          variant="subtle"
          :actions="[{ label: t('more.contactSupport'), to: supportUrl, target: '_blank', external: true, color: 'neutral', variant: 'outline' }]"
          data-testid="ask-change"
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
            class="aspect-3/2 w-full"
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
              <h2 class="min-w-0 font-semibold wrap-break-word text-highlighted">
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
              <!-- D39: an HTML slip is laid out by the server; its fields have no place of their own to draw at. -->
              <ServerSlip
                v-if="template.design.html !== undefined"
                :path="`/shop/templates/${template.templateId}/sample`"
                :width="template.design.width"
                :height="template.design.height"
              />
              <SlipSvg
                v-else-if="slipText.text.value"
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
                :to="{ path: '/', query: { template: template.templateId } }"
              />
              <UButton
                v-if="!template.isDefault && can('template:set-default')"
                :label="t('orders.slips.makeDefault')"
                icon="i-lucide-star"
                :loading="choosing === template.templateId"
                :disabled="makeDefault.pending.value"
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
