import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { orders } from '#server/features/orders/orders.schema'
import { templateVersions } from '#server/features/templates/templates.schema'
import type { Db } from '#server/utils/batch'
import { createTestDb } from '#server/tests/support/db'
import { createOwner } from '#server/tests/support/auth'
import { createTestOrder, createTestTemplate } from '#server/tests/support/slips'

// The orders table's own rules (plan §4, §7), enforced by the database: the owner portal (step 3)
// relies on them.

let db: Db
let a: { shopId: string, userId: string }
let b: { shopId: string, userId: string }
let versionId: string

beforeEach(async () => {
  db = await createTestDb()
  a = await createOwner(db)
  b = await createOwner(db)
  versionId = (await createTestTemplate(db, a.userId)).versionId
})

const order = (shop: { shopId: string, userId: string }, number: number) => createTestOrder(db, { ...shop, versionId, number })

describe('orders', () => {
  it('numbers are unique per shop; two shops count on their own', async () => {
    await order(a, 1)
    await expect(order(a, 1)).rejects.toThrow()
    await order(b, 1)
    expect(await db.$count(orders)).toBe(2)
  })

  it('keeps its template version: a version with orders can\'t be deleted', async () => {
    await order(a, 1)
    await expect(db.delete(templateVersions).where(eq(templateVersions.id, versionId))).rejects.toThrow()
  })

  it('paid, picked up and cancelled each go with their time', async () => {
    const { orderId } = await order(a, 1)
    const set = (values: Partial<typeof orders.$inferInsert>) => db.update(orders).set(values).where(eq(orders.id, orderId))
    const now = new Date()
    await expect(set({ paid: true })).rejects.toThrow()
    await set({ paid: true, paidAt: now })
    await expect(set({ status: 'picked_up' })).rejects.toThrow()
    await set({ status: 'picked_up', pickedUpAt: now })
    await expect(set({ status: 'cancelled' })).rejects.toThrow()
    await expect(set({ status: 'open' })).rejects.toThrow()
  })

  it('refuses a malformed day, a negative amount or an unknown status', async () => {
    const { orderId } = await order(a, 1)
    const set = (values: Partial<typeof orders.$inferInsert>) => db.update(orders).set(values).where(eq(orders.id, orderId))
    await expect(set({ date: '17/11/2026' })).rejects.toThrow()
    await expect(set({ amount: -1 })).rejects.toThrow()
    await expect(set({ status: 'ready' as never })).rejects.toThrow()
    await set({ amount: 12000 })
  })
})
