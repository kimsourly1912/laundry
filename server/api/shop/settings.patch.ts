import { updateShopSettingsSchema } from '#shared/contracts/shop-settings'
import { updateSettings } from '#server/features/shops'

/** `PATCH /api/shop/settings`: every setting at the version read. */
export default defineEventHandler(async (event) => {
  const actor = await requireShopPermission(event, { shop: ['update'] })
  const input = await readValidBody(event, updateShopSettingsSchema)
  return updateSettings(useDb(), actor, input)
})
