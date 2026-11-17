import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createElement } from '#shared/slip/elements'
import { archiveTemplate, attachTemplate, createTemplate, detachTemplate, getTemplate, listTemplates, publishTemplate, restoreTemplate, shopTemplates, templateShops, updateTemplate } from '#server/features/templates'
import { templateShops as templateShopsTable } from '#server/features/templates/templates.schema'
import { auditEvents } from '#server/features/platform/platform.schema'
import type { PlatformActor } from '#server/features/identity'
import type { Db } from '#server/utils/batch'
import { createTestDb } from '#server/tests/support/db'
import { createOwner, createTestUser } from '#server/tests/support/auth'

// Templates attached to shops, and archiving (plan §4, step 2). `template_shops` is shop-owned:
// every case runs with two shops, and a change for one never shows in or touches the other.

let db: Db
let actor: PlatformActor
let a: { shopId: string }
let b: { shopId: string }

beforeEach(async () => {
  db = await createTestDb()
  const admin = await createTestUser(db, { role: 'superadmin' })
  actor = { userId: admin.userId, platformRole: 'superadmin', requestId: 'req-1' }
  a = await createOwner(db, { name: 'Alpha Wash' })
  b = await createOwner(db, { name: 'Beta Wash' })
})

function refusal(promise: Promise<unknown>) {
  return promise.then(() => 'allowed', (error: { statusCode?: number, data?: { code?: string }, message?: string }) =>
    error.statusCode ? `${error.statusCode} ${error.data?.code}` : `error: ${error.message}`)
}

let names = 0
/** A published template (version 1). */
async function published() {
  const template = await createTemplate(db, actor, { name: `Template ${++names}`, start: { kind: 'blank', width: 800, height: 500 } })
  const ready = await updateTemplate(db, actor, template.id, { version: 1, design: { ...template.design, elements: [createElement('orderNo', { id: 'no' })] } })
  return publishTemplate(db, actor, template.id, { version: ready.version })
}

const missing = '0190f2a0-0000-7000-8000-000000000009'

describe('attachTemplate and detachTemplate', () => {
  it('attaches to one shop only, lists it both ways, and counts it', async () => {
    const template = await published()
    const shops = await attachTemplate(db, actor, template.id, { shopId: a.shopId })
    expect(shops).toMatchObject([{ shopId: a.shopId, name: 'Alpha Wash', isDefault: false }])
    expect(await shopTemplates(db, a.shopId)).toMatchObject([{ templateId: template.id, name: template.name, status: 'published', isDefault: false }])
    // The other shop sees nothing.
    expect(await shopTemplates(db, b.shopId)).toEqual([])
    expect((await listTemplates(db, { page: 1, pageSize: 20 })).items[0]).toMatchObject({ id: template.id, shopCount: 1 })
    expect((await getTemplate(db, template.id)).shopCount).toBe(1)

    // Again: nothing changes, no second audit row.
    await attachTemplate(db, actor, template.id, { shopId: a.shopId })
    const audit = await db.select({ action: auditEvents.action, data: auditEvents.data, shopId: auditEvents.shopId }).from(auditEvents).where(eq(auditEvents.action, 'template.attach'))
    expect(audit).toEqual([{ action: 'template.attach', data: { shopId: a.shopId }, shopId: null }])
  })

  it('detaches from one shop and leaves the other\'s attachment and default alone', async () => {
    const template = await published()
    await attachTemplate(db, actor, template.id, { shopId: a.shopId })
    await attachTemplate(db, actor, template.id, { shopId: b.shopId })
    await db.update(templateShopsTable).set({ isDefault: true }).where(eq(templateShopsTable.shopId, b.shopId))
    const left = await detachTemplate(db, actor, template.id, a.shopId)
    expect(left).toMatchObject([{ shopId: b.shopId, isDefault: true }])
    expect(await shopTemplates(db, a.shopId)).toEqual([])
    // Not attached any more: detaching again changes nothing.
    expect(await detachTemplate(db, actor, template.id, a.shopId)).toHaveLength(1)
  })

  it('refuses a draft or archived template, and a missing template or shop', async () => {
    const draft = await createTemplate(db, actor, { name: 'Draft only', start: { kind: 'blank', width: 800, height: 500 } })
    expect(await refusal(attachTemplate(db, actor, draft.id, { shopId: a.shopId }))).toBe('422 TEMPLATE_NOT_ATTACHABLE')
    const template = await published()
    await archiveTemplate(db, actor, template.id, { version: template.version })
    expect(await refusal(attachTemplate(db, actor, template.id, { shopId: a.shopId }))).toBe('422 TEMPLATE_NOT_ATTACHABLE')
    expect(await refusal(attachTemplate(db, actor, missing, { shopId: a.shopId }))).toBe('404 NOT_FOUND')
    expect(await refusal(attachTemplate(db, actor, draft.id, { shopId: missing }))).toBe('404 NOT_FOUND')
    expect(await refusal(shopTemplates(db, missing))).toBe('404 NOT_FOUND')
    expect(await refusal(templateShops(db, missing))).toBe('404 NOT_FOUND')
    expect(await db.$count(templateShopsTable)).toBe(0)
  })
})

describe('archiveTemplate and restoreTemplate', () => {
  it('archives at the version read, detaching it from every shop; restores it as published', async () => {
    const template = await published()
    await attachTemplate(db, actor, template.id, { shopId: a.shopId })
    await attachTemplate(db, actor, template.id, { shopId: b.shopId })
    expect(await refusal(archiveTemplate(db, actor, template.id, { version: template.version - 1 }))).toBe('409 VERSION_CONFLICT')
    const archived = await archiveTemplate(db, actor, template.id, { version: template.version })
    expect(archived).toMatchObject({ status: 'archived', shopCount: 0 })
    expect(await shopTemplates(db, a.shopId)).toEqual([])
    expect(await shopTemplates(db, b.shopId)).toEqual([])
    expect(await refusal(archiveTemplate(db, actor, template.id, { version: archived.version }))).toBe('409 INVALID_STATE')

    const restored = await restoreTemplate(db, actor, template.id, { version: archived.version })
    expect(restored).toMatchObject({ status: 'published', latestVersion: 1, shopCount: 0 })
    expect(await refusal(restoreTemplate(db, actor, template.id, { version: restored.version }))).toBe('409 INVALID_STATE')
  })

  it('restores a template that was never published as a draft', async () => {
    const draft = await createTemplate(db, actor, { name: 'Never published', start: { kind: 'blank', width: 800, height: 500 } })
    const archived = await archiveTemplate(db, actor, draft.id, { version: 1 })
    expect((await restoreTemplate(db, actor, draft.id, { version: archived.version })).status).toBe('draft')
  })
})
