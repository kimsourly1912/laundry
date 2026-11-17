import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { images, templateShops, templates, templateVersions } from '#server/features/templates/templates.schema'
import type { Db } from '#server/utils/batch'
import { createTestDb } from '#server/tests/support/db'
import { createOwner } from '#server/tests/support/auth'
import { attachTestTemplate, createTestTemplate } from '#server/tests/support/slips'

// The templates tables' own rules (plan §4, §7), enforced by the database: the studio (S1) and the
// platform screens (step 2) rely on them.

let db: Db
let a: { shopId: string, userId: string }
let b: { shopId: string, userId: string }

beforeEach(async () => {
  db = await createTestDb()
  a = await createOwner(db)
  b = await createOwner(db)
})

describe('template_shops', () => {
  it('a shop has at most one default; another shop has its own', async () => {
    const first = await createTestTemplate(db, a.userId)
    const second = await createTestTemplate(db, a.userId)
    await attachTestTemplate(db, { shopId: a.shopId, templateId: first.templateId, isDefault: true })
    await expect(attachTestTemplate(db, { shopId: a.shopId, templateId: second.templateId, isDefault: true })).rejects.toThrow()
    // Attached without being the default: fine.
    await attachTestTemplate(db, { shopId: a.shopId, templateId: second.templateId })
    // The same template is shop B's default too.
    await attachTestTemplate(db, { shopId: b.shopId, templateId: first.templateId, isDefault: true })
    expect(await db.$count(templateShops, eq(templateShops.isDefault, true))).toBe(2)
  })

  it('a template is attached to a shop once', async () => {
    const { templateId } = await createTestTemplate(db, a.userId)
    await attachTestTemplate(db, { shopId: a.shopId, templateId })
    await expect(attachTestTemplate(db, { shopId: a.shopId, templateId })).rejects.toThrow()
  })

  it('detaching the default leaves the shop with none, never another shop\'s', async () => {
    const { templateId } = await createTestTemplate(db, a.userId)
    await attachTestTemplate(db, { shopId: a.shopId, templateId, isDefault: true })
    await attachTestTemplate(db, { shopId: b.shopId, templateId, isDefault: true })
    await db.delete(templateShops).where(and(eq(templateShops.shopId, a.shopId), eq(templateShops.templateId, templateId)))
    expect(await db.select({ shopId: templateShops.shopId }).from(templateShops)).toEqual([{ shopId: b.shopId }])
  })

  it('only a real template and a real shop', async () => {
    const { templateId } = await createTestTemplate(db, a.userId)
    await expect(attachTestTemplate(db, { shopId: a.shopId, templateId: '01900000-0000-7000-8000-00000000dead' })).rejects.toThrow()
    await expect(attachTestTemplate(db, { shopId: '01900000-0000-7000-8000-00000000dead', templateId })).rejects.toThrow()
  })
})

describe('templates and versions', () => {
  it('names are unique whatever the case', async () => {
    const design = { elements: [] }
    await db.insert(templates).values({ id: '01900000-0000-7000-8000-000000000001', name: 'Linda slip', design, createdBy: a.userId })
    await expect(db.insert(templates).values({ id: '01900000-0000-7000-8000-000000000002', name: 'LINDA SLIP', design, createdBy: a.userId })).rejects.toThrow()
  })

  it('a version number is used once per template; a template with versions can\'t be deleted', async () => {
    const { templateId } = await createTestTemplate(db, a.userId)
    await expect(db.insert(templateVersions).values({ id: '01900000-0000-7000-8000-000000000003', templateId, number: 1, design: {}, createdBy: a.userId })).rejects.toThrow()
    await db.insert(templateVersions).values({ id: '01900000-0000-7000-8000-000000000004', templateId, number: 2, design: {}, createdBy: a.userId })
    await expect(db.delete(templates).where(eq(templates.id, templateId))).rejects.toThrow()
  })
})

describe('images', () => {
  const image = { name: 'slip.png', type: 'image/png' as const, width: 800, height: 600, size: 1000, data: 'iVBORw0KGgo=' }

  it('only PNG or JPEG, up to 1 MB, 200–2000 px a side', async () => {
    let n = 10
    const insert = (values: Partial<typeof image>) => db.insert(images).values({ ...image, ...values, id: `01900000-0000-7000-8000-0000000000${++n}`, createdBy: a.userId })
    await insert({})
    await expect(insert({ type: 'image/gif' as never })).rejects.toThrow()
    await expect(insert({ size: 1024 * 1024 + 1 })).rejects.toThrow()
    await expect(insert({ width: 199 })).rejects.toThrow()
    await expect(insert({ height: 2001 })).rejects.toThrow()
  })
})
