import { blankDesign } from '#shared/contracts/slip-design'
import type { SlipDesign } from '#shared/contracts/slip-design'
import { createElement, createGroup } from '#shared/slip/elements'
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

/**
 * A counter slip like a shop's paper one: Order No., date, shirt and pants counts (shirts required),
 * a name, a service choice, phone, amount and Paid / Not paid.
 */
export function counterDesign(): SlipDesign {
  return {
    ...blankDesign(800, 520),
    elements: [
      createElement('orderNo', { id: 'no', x: 600, y: 20 }),
      createElement('date', { id: 'day', x: 600, y: 70 }),
      createElement('number', { id: 'shirt', x: 40, y: 140 }, { label: 'Shirt', required: true }),
      createElement('number', { id: 'pants', x: 40, y: 200 }, { label: 'Pants' }),
      createElement('textField', { id: 'name', x: 40, y: 20 }, { label: 'Customer' }),
      createElement('option', { id: 'wash', x: 300, y: 140 }, { group: 'svc', label: 'Wash + iron' }),
      createElement('option', { id: 'iron', x: 300, y: 200 }, { group: 'svc', label: 'Iron only' }),
      createElement('phone', { id: 'tel', x: 40, y: 300 }),
      createElement('amount', { id: 'total', x: 40, y: 400 }),
      createElement('paid', { id: 'yes', x: 600, y: 400 }, { value: 'paid', label: 'Paid' }),
      createElement('paid', { id: 'no-pay', x: 660, y: 400 }, { value: 'unpaid', label: 'Not paid' }),
    ],
    groups: [createGroup('svc', { label: 'Service' })],
    fillOrder: ['name', 'shirt', 'pants', 'svc', 'tel', 'total', 'paid'],
  }
}

/** A published template with version 1 (a blank slip unless a design is given), made by `userId`. */
export async function createTestTemplate(db: Db, userId: string, options: { design?: SlipDesign, name?: string } = {}) {
  const { design = blankDesign(800, 520), name = `Template ${++templateCount}` } = options
  const templateId = newId()
  const versionId = newId()
  await db.batch([
    db.insert(templates).values({ id: templateId, name, status: 'published', design, createdBy: userId }),
    db.insert(templateVersions).values({ id: versionId, templateId, number: 1, design, createdBy: userId }),
  ])
  return { templateId, versionId }
}

/** Publishes the template again: version `number` with `design`. */
export async function publishTestVersion(db: Db, version: { templateId: string, userId: string, number: number, design: SlipDesign }) {
  const { templateId, userId, number, design } = version
  const versionId = newId()
  await db.insert(templateVersions).values({ id: versionId, templateId, number, design, createdBy: userId })
  return { versionId }
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
