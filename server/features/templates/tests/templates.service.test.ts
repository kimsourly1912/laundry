import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { CreateTemplateInput, TemplateDefinition } from '#shared/contracts/templates'
import { MAX_ACTIVE_TEMPLATES } from '#shared/contracts/templates'
import type { PlatformActor } from '#server/features/identity'
import { archiveTemplate, createTemplate, getTemplate, listTemplates, restoreTemplate, templateForNewShop, updateTemplate } from '#server/features/templates'
import { slipTemplates } from '#server/features/templates/templates.schema'
import { auditEvents } from '#server/features/platform/platform.schema'
import type { Db, Statement } from '#server/utils/batch'
import { insertAll } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { createTestDb } from '#server/tests/support/db'
import { createTestUser } from '#server/tests/support/auth'

// Slip templates (D25) against SQLite built from the migrations. Templates are the platform's,
// not a shop's: there is no shop to keep apart, and only the super admin's statements reach them
// (server/tests/routes.test.ts pins each route's statement).

let db: Db
let actor: PlatformActor

beforeEach(async () => {
  db = await createTestDb()
  const admin = await createTestUser(db, { role: 'superadmin' })
  actor = { userId: admin.userId, platformRole: 'superadmin', requestId: 'req-1' }
})

const definition: TemplateDefinition = {
  services: [{ key: 'wash', nameEn: 'Wash & iron', nameKm: 'បោកអ៊ុត' }],
  items: [{ key: 'shirt', nameEn: 'Shirt', nameKm: 'អាវ', unit: 'piece' }, { key: 'kg', nameEn: 'Mixed', nameKm: null, unit: 'kg' }],
  prices: [{ service: 'wash', item: 'shirt', price: 1000 }, { service: 'wash', item: 'kg', price: 2500 }],
}

let made = 0
function input(overrides: Partial<CreateTemplateInput> = {}): CreateTemplateInput {
  return { name: `Template ${++made}`, currency: 'KHR', definition, ...overrides }
}

function refusal(promise: Promise<unknown>) {
  return promise.then(() => 'allowed', (error: { statusCode?: number, data?: { code?: string }, message?: string }) =>
    error.statusCode ? `${error.statusCode} ${error.data?.code}` : `error: ${error.message}`)
}

const auditOf = (id: string) => db.select({ action: auditEvents.action, shopId: auditEvents.shopId, actorUserId: auditEvents.actorUserId }).from(auditEvents)
  .where(and(eq(auditEvents.targetType, 'template'), eq(auditEvents.targetId, id))).orderBy(auditEvents.createdAt)

describe('createTemplate', () => {
  it('saves the template with its audit row (a platform action: no shop)', async () => {
    const template = await createTemplate(db, actor, input({ name: 'Standard laundry' }))
    expect(template).toMatchObject({ name: 'Standard laundry', currency: 'KHR', status: 'active', version: 1, serviceCount: 1, itemCount: 2, definition })
    expect(await getTemplate(db, template.id)).toEqual(template)
    expect(await auditOf(template.id)).toEqual([{ action: 'template.create', shopId: null, actorUserId: actor.userId }])
  })

  it('refuses a name another template has, whatever the case, and writes nothing', async () => {
    await createTemplate(db, actor, input({ name: 'Standard' }))
    expect(await refusal(createTemplate(db, actor, input({ name: 'STANDARD' })))).toBe('409 TEMPLATE_NAME_TAKEN')
    expect(await db.$count(slipTemplates)).toBe(1)
    expect(await db.$count(auditEvents)).toBe(1)
  })

  it(`keeps at most ${MAX_ACTIVE_TEMPLATES} active templates, archived ones not counted`, async () => {
    const now = new Date()
    const rows = Array.from({ length: MAX_ACTIVE_TEMPLATES }, (_, i) => ({ id: newId(), name: `Full ${i}`, currency: 'KHR' as const, definition, createdAt: now, updatedAt: now }))
    await db.batch(insertAll(db, slipTemplates, rows) as [Statement, ...Statement[]])
    expect(await refusal(createTemplate(db, actor, input()))).toBe('409 TEMPLATE_LIST_FULL')
    const [first] = (await listTemplates(db, {})).items
    await archiveTemplate(db, actor, first!.id, { version: 1 })
    expect(await refusal(createTemplate(db, actor, input()))).toBe('allowed')
    // A restore counts too.
    expect(await refusal(restoreTemplate(db, actor, first!.id, { version: 2 }))).toBe('409 TEMPLATE_LIST_FULL')
  })
})

describe('listTemplates', () => {
  it('lists the active templates by name by default, the archived ones on request', async () => {
    const b = await createTemplate(db, actor, input({ name: 'B shops' }))
    await createTemplate(db, actor, input({ name: 'A shops', currency: 'USD' }))
    await archiveTemplate(db, actor, b.id, { version: 1 })
    expect((await listTemplates(db, {})).items.map(item => `${item.name} ${item.currency}`)).toEqual(['A shops USD'])
    expect((await listTemplates(db, { status: 'archived' })).items.map(item => item.name)).toEqual(['B shops'])
    // The list carries no definition: only what picking one needs.
    expect((await listTemplates(db, {})).items[0]).not.toHaveProperty('definition')
  })
})

describe('updateTemplate (at the version read)', () => {
  it('replaces the name, currency and definition, raises the version, audits', async () => {
    const template = await createTemplate(db, actor, input())
    const changed: TemplateDefinition = { ...definition, prices: [{ service: 'wash', item: 'shirt', price: 1500 }] }
    const updated = await updateTemplate(db, actor, template.id, { version: 1, name: 'Renamed', currency: 'USD', definition: changed })
    expect(updated).toMatchObject({ name: 'Renamed', currency: 'USD', version: 2, definition: changed })
    expect((await auditOf(template.id)).map(row => row.action)).toEqual(['template.create', 'template.update'])
  })

  it('refuses a stale version, an archived template, a missing one and a taken name', async () => {
    const template = await createTemplate(db, actor, input())
    const other = await createTemplate(db, actor, input({ name: 'Other' }))
    const fields = { name: 'New name', currency: 'KHR' as const, definition }
    await updateTemplate(db, actor, template.id, { version: 1, ...fields })
    expect(await refusal(updateTemplate(db, actor, template.id, { version: 1, ...fields }))).toBe('409 VERSION_CONFLICT')
    expect(await refusal(updateTemplate(db, actor, template.id, { version: 2, ...fields, name: 'other' }))).toBe('409 TEMPLATE_NAME_TAKEN')
    await archiveTemplate(db, actor, other.id, { version: 1 })
    expect(await refusal(updateTemplate(db, actor, other.id, { version: 2, ...fields, name: 'Other' }))).toBe('409 INVALID_STATE')
    expect(await refusal(updateTemplate(db, actor, newId(), { version: 1, ...fields }))).toBe('404 NOT_FOUND')
    expect((await getTemplate(db, template.id)).version).toBe(2)
  })
})

describe('archiveTemplate / restoreTemplate', () => {
  it('archives and restores at the version read, each audited, each only from the other state', async () => {
    const template = await createTemplate(db, actor, input())
    expect(await archiveTemplate(db, actor, template.id, { version: 1 })).toMatchObject({ status: 'archived', version: 2 })
    expect(await refusal(archiveTemplate(db, actor, template.id, { version: 2 }))).toBe('409 INVALID_STATE')
    expect(await refusal(restoreTemplate(db, actor, template.id, { version: 1 }))).toBe('409 VERSION_CONFLICT')
    expect(await restoreTemplate(db, actor, template.id, { version: 2 })).toMatchObject({ status: 'active', version: 3 })
    expect(await refusal(restoreTemplate(db, actor, template.id, { version: 3 }))).toBe('409 INVALID_STATE')
    expect((await auditOf(template.id)).map(row => row.action)).toEqual(['template.create', 'template.archive', 'template.restore'])
  })
})

describe('templateForNewShop', () => {
  it('gives an active template\'s currency and definition, and refuses an archived or missing one', async () => {
    const template = await createTemplate(db, actor, input({ currency: 'USD' }))
    expect(await templateForNewShop(db, template.id)).toEqual({ currency: 'USD', definition })
    await archiveTemplate(db, actor, template.id, { version: 1 })
    expect(await refusal(templateForNewShop(db, template.id))).toBe('409 TEMPLATE_UNAVAILABLE')
    expect(await refusal(templateForNewShop(db, newId()))).toBe('404 NOT_FOUND')
  })
})
