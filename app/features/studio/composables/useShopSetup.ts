import type { PlatformShopDetail } from '#shared/contracts/platform-shops'
import type { ShopTemplate, TemplateShop } from '#shared/contracts/templates'
import { publishAndAssign } from '../utils/publish-assign'
import type { PublishAssignResult } from '../utils/publish-assign'

/**
 * The shop a paper slip is being set up for (City Laundry pilot §2): Shops → a shop → Set up paper
 * slip opens the Studio at `?shop=<id>`, and the id rides along from the new draft to its page. The
 * shop is read with the platform's own APIs (`shop: ['read']`), and the template is attached with the
 * existing attach API (`template: ['write'], shop: ['update']`), which the server checks again.
 * Without `?shop` the Studio works as before.
 */
export function useShopSetup(templateId: () => string | undefined) {
  const route = useRoute()
  const { can } = useSession()
  const shopId = computed(() => {
    const value = route.query.shop
    return typeof value === 'string' && value ? value : undefined
  })

  const shop = useApiQuery(
    () => `studio:setup-shop:${shopId.value ?? 'none'}`,
    async () => (shopId.value ? apiFetch<PlatformShopDetail>(`/platform/shops/${shopId.value}`) : null),
    { watch: [shopId] },
  )
  /** Whether the template is attached to the shop now (a reload after a failed assignment asks the server). */
  const attachment = useApiQuery(
    () => `studio:setup-attached:${templateId() ?? 'new'}:${shopId.value ?? 'none'}`,
    async () => {
      const id = templateId()
      const currentShop = shopId.value
      if (!id || !currentShop) return false
      const templates = await apiFetch<ShopTemplate[]>(`/platform/shops/${currentShop}/templates`)
      return templates.some(item => item.templateId === id)
    },
    { watch: [shopId] },
  )

  /** The shop, once read; a missing or unreadable one gives no setup (the page says why). */
  const target = computed(() => shop.data.value ? { id: shop.data.value.id, name: shop.data.value.name } : undefined)
  const canAssign = computed(() => can('template:write') && can('shop:update'))

  function attach() {
    return apiFetch<TemplateShop[]>(`/platform/templates/${templateId()}/shops`, { method: 'POST', body: { shopId: shopId.value } })
  }

  /** Publishes (when `publish` is given), then assigns; refreshes what the platform pages show. */
  async function run(options: { publish?: () => Promise<number>, number?: number }): Promise<PublishAssignResult> {
    const result = await publishAndAssign({ ...options, attach })
    if (result.status !== 'publishFailed') {
      await Promise.all([attachment.refresh(), invalidate('platform')])
    }
    return result
  }

  /** The shop or its attachment is still being read: the Studio's action waits rather than switch. */
  const loading = computed(() => Boolean(shopId.value) && ((!shop.data.value && !shop.error.value) || attachment.loading.value))

  return {
    shopId,
    target,
    loading,
    shopError: shop.error,
    attached: computed(() => attachment.data.value === true),
    canAssign,
    run,
  }
}
