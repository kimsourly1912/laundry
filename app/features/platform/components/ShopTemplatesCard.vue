<script setup lang="ts">
/**
 * The templates a shop may use (plan §4, step 2), on the shop's page: attach a published template,
 * or detach one. Detaching the shop's default leaves it with none; its owner chooses again.
 */
import type { Page } from '#shared/contracts/common'
import type { ShopTemplate, TemplateSummary } from '#shared/contracts/templates'

const props = defineProps<{ shopId: string }>()
const { t } = useI18n()
const { can } = useSession()

const attached = useApiQuery(() => `platform:shop-templates:${props.shopId}`, () => apiFetch<ShopTemplate[]>(`/platform/shops/${props.shopId}/templates`))
const published = useApiQuery('platform:published-templates', () => apiFetch<Page<TemplateSummary>>('/platform/templates', { query: { status: 'published', pageSize: 100 } }))

const choices = computed(() => {
  const taken = new Set((attached.data.value ?? []).map(item => item.templateId))
  return (published.data.value?.items ?? []).filter(item => !taken.has(item.id)).map(item => ({ value: item.id, label: item.name }))
})
const chosen = ref<string>()

const attach = useMutation((templateId: string) => apiFetch(`/platform/templates/${templateId}/shops`, { method: 'POST', body: { shopId: props.shopId } }), {
  invalidate: ['platform', 'studio'],
  success: () => t('platform.shop.templates.attached'),
})
const detach = useMutation((templateId: string) => apiFetch(`/platform/templates/${templateId}/shops/${props.shopId}`, { method: 'DELETE' }), {
  invalidate: ['platform', 'studio'],
  success: () => t('platform.shop.templates.detached'),
})

async function onAttach() {
  if (!chosen.value) return
  const result = await attach.execute(chosen.value)
  if (result.ok) chosen.value = undefined
}
</script>

<template>
  <UPageCard
    :title="t('platform.shop.templates.title')"
    :description="t('platform.shop.templates.description')"
    variant="subtle"
  >
    <PageLoadError
      v-if="attached.error.value && !attached.data.value"
      :error="attached.error.value"
      @retry="attached.refresh()"
    />
    <USkeleton
      v-else-if="attached.loading.value"
      class="h-12 w-full"
    />
    <template v-else>
      <p
        v-if="!attached.data.value?.length"
        class="text-sm text-warning"
      >
        {{ t('platform.shop.templates.none') }}
      </p>
      <ul
        v-else
        class="divide-y divide-default"
        data-testid="shop-templates"
      >
        <li
          v-for="item in attached.data.value"
          :key="item.templateId"
          class="flex items-center justify-between gap-3 py-2"
        >
          <div class="min-w-0">
            <NuxtLink
              :to="`/platform/templates/${item.templateId}`"
              class="font-medium break-words hover:underline"
            >{{ item.name }}</NuxtLink>
            <UBadge
              v-if="item.isDefault"
              :label="t('platform.shop.templates.default')"
              color="primary"
              variant="subtle"
              class="ms-2"
            />
          </div>
          <UButton
            v-if="can('template:write')"
            :label="t('platform.shop.templates.detach')"
            color="neutral"
            variant="ghost"
            size="sm"
            :loading="detach.pending.value"
            @click="detach.execute(item.templateId)"
          />
        </li>
      </ul>
      <div
        v-if="can('template:write')"
        class="flex flex-wrap items-end gap-2 pt-2"
      >
        <UFormField
          :label="t('platform.shop.templates.add')"
          class="min-w-56 flex-1"
        >
          <USelect
            v-model="chosen"
            :items="choices"
            :placeholder="choices.length ? t('platform.shop.templates.choose') : t('platform.shop.templates.noneToAdd')"
            :disabled="!choices.length"
            class="w-full"
          />
        </UFormField>
        <UButton
          :label="t('platform.shop.templates.attach')"
          :disabled="!chosen"
          :loading="attach.pending.value"
          @click="onAttach"
        />
      </div>
    </template>
  </UPageCard>
</template>
