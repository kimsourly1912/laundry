<script setup lang="ts">
/** The shops using a template (plan §4, step 2): attach it to a shop, or detach it. */
import type { Page } from '#shared/contracts/common'
import type { PlatformShop } from '#shared/contracts/platform-shops'
import type { TemplateShop } from '#shared/contracts/templates'

const props = defineProps<{ templateId: string, published: boolean }>()
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()

const shops = useApiQuery(() => `studio:template-shops:${props.templateId}`, () => apiFetch<TemplateShop[]>(`/platform/templates/${props.templateId}/shops`), { immediate: false })
const allShops = useApiQuery('studio:all-shops', () => apiFetch<Page<PlatformShop>>('/platform/shops', { query: { pageSize: 100 } }), { immediate: false })
watch(open, (value) => {
  if (value) {
    shops.refresh()
    allShops.refresh()
  }
})

const choices = computed(() => {
  const taken = new Set((shops.data.value ?? []).map(item => item.shopId))
  return (allShops.data.value?.items ?? []).filter(item => !taken.has(item.id)).map(item => ({ value: item.id, label: item.name }))
})
const chosen = ref<string>()

const attach = useMutation((shopId: string) => apiFetch<TemplateShop[]>(`/platform/templates/${props.templateId}/shops`, { method: 'POST', body: { shopId } }), { invalidate: ['studio', 'platform'] })
const detach = useMutation((shopId: string) => apiFetch<TemplateShop[]>(`/platform/templates/${props.templateId}/shops/${shopId}`, { method: 'DELETE' }), { invalidate: ['studio', 'platform'] })

async function onAttach() {
  if (!chosen.value) return
  const result = await attach.execute(chosen.value)
  if (result.ok) chosen.value = undefined
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('studio.shops.title')"
    :description="t('studio.shops.description')"
  >
    <template #body>
      <div class="space-y-4">
        <USkeleton
          v-if="shops.loading.value"
          class="h-12 w-full"
        />
        <p
          v-else-if="!shops.data.value?.length"
          class="text-sm text-muted"
        >
          {{ t('studio.shops.none') }}
        </p>
        <ul
          v-else
          class="divide-y divide-default"
          data-testid="template-shops"
        >
          <li
            v-for="item in shops.data.value"
            :key="item.shopId"
            class="flex items-center justify-between gap-3 py-2"
          >
            <span class="min-w-0 break-words">
              {{ item.name }}
              <UBadge
                v-if="item.isDefault"
                :label="t('studio.shops.default')"
                variant="subtle"
                class="ms-2"
              />
            </span>
            <UButton
              :label="t('studio.shops.detach')"
              color="neutral"
              variant="ghost"
              size="sm"
              :loading="detach.pending.value"
              @click="detach.execute(item.shopId)"
            />
          </li>
        </ul>
        <p
          v-if="!published"
          class="text-sm text-muted"
        >
          {{ t('studio.shops.notPublished') }}
        </p>
        <div
          v-else
          class="flex items-end gap-2"
        >
          <UFormField
            :label="t('studio.shops.add')"
            class="flex-1"
          >
            <USelect
              v-model="chosen"
              :items="choices"
              :placeholder="t('studio.shops.choose')"
              class="w-full"
            />
          </UFormField>
          <UButton
            :label="t('studio.shops.attach')"
            :disabled="!chosen"
            :loading="attach.pending.value"
            @click="onAttach"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
