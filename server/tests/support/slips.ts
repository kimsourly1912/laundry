import { blankDesign } from '#shared/contracts/slip-design'
import { templateShops, templates, templateVersions } from '#server/features/templates/templates.schema'
import { orders } from '#server/features/orders/orders.schema'
import type { Db } from '#server/utils/batch'
import { newId } from '#server/utils/ids'

/**
 * Templates and orders written straight into the tables, for tests of the tables and of features
 * that point at orders (Telegram, the outbox). The studio (S1) and the owner portal (step 3) bring
 * their own services; these helpers only make valid rows.
 */

let templateCount = 0

/** A published template with version 1, made by `userId`. */
export async function createTestTemplate(db: Db, userId: string) {
  const templateId = newId()
  const versionId = newId()
  const design = blankDesign(800, 520)
  await db.batch([
    db.insert(templates).values({ id: templateId, name: `Template ${++templateCount}`, status: 'published', design, createdBy: userId }),
    db.insert(templateVersions).values({ id: versionId, templateId, number: 1, design, createdBy: userId }),
  ])
  return { templateId, versionId }
}

/** Attaches the template to the shop, as its default when asked. */
export async function attachTestTemplate(db: Db, attachment: { shopId: string, templateId: string, isDefault?: boolean }) {
  const { shopId, templateId, isDefault = false } = attachment
  await db.insert(templateShops).values({ shopId, templateId, isDefault })
}

let orderCount = 0

/** An open, unpaid order of the shop on the template version, made by `userId`. */
export async function createTestOrder(db: Db, order: { shopId: string, userId: string, versionId: string, number?: number }) {
  const { shopId, userId, versionId, number = ++orderCount } = order
  const id = newId()
  await db.insert(orders).values({
    id,
    shopId,
    number,
    date: '2026-11-17',
    templateVersionId: versionId,
    values: {},
    shop: { name: 'Shop', phone: null, address: null, logoImageId: null, currency: 'KHR' },
    createdBy: userId,
  })
  return { orderId: id, number }
}
