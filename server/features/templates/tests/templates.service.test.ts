import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { blankDesign } from '#shared/contracts/slip-design'
import type { SlipDesign } from '#shared/contracts/slip-design'
import { createElement } from '#shared/slip/elements'
import { createTemplate, getImage, getTemplate, imageBytes, listImages, listTemplates, previewTemplate, publishTemplate, updateTemplate, uploadImage } from '#server/features/templates'
import { imageInfo } from '#server/features/templates/images.bytes'
import { renderSlipPng } from '#server/features/templates/templates.render'
import { images, templates, templateVersions } from '#server/features/templates/templates.schema'
import { auditEvents } from '#server/features/platform/platform.schema'
import type { PlatformActor } from '#server/features/identity'
import type { Db } from '#server/utils/batch'
import { createTestDb } from '#server/tests/support/db'
import { createTestUser } from '#server/tests/support/auth'

// The platform's templates and images (plan §5, S1) against SQLite built from the migrations.
// Platform tables only: no shop's data is read or written here.

let db: Db
let actor: PlatformActor

beforeEach(async () => {
  db = await createTestDb()
  const admin = await createTestUser(db, { role: 'superadmin' })
  actor = { userId: admin.userId, platformRole: 'superadmin', requestId: 'req-1' }
})

function refusal(promise: Promise<unknown>) {
  return promise.then(() => 'allowed', (error: { statusCode?: number, data?: { code?: string }, message?: string }) =>
    error.statusCode ? `${error.statusCode} ${error.data?.code}` : `error: ${error.message}`)
}

const empty = { values: {}, order: { number: null, date: null, phone: null, amount: null, paid: null }, shop: { name: '', phone: null, address: null, logoImageId: null, currency: 'KHR' as const, language: 'en' as const } }

/** A plain PNG of `width` × `height`, drawn by the slip renderer itself. */
function pngOf(width: number, height: number) {
  return renderSlipPng({ design: blankDesign(width, height), data: empty, images: new Map() })
}

/** The start of a JPEG (SOI, then a baseline frame header): enough for its type and size. */
function jpegHeader(width: number, height: number) {
  return new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 4, 0, 0, 0xFF, 0xC0, 0, 11, 8, height >> 8, height & 0xFF, width >> 8, width & 0xFF, 1, 1, 0x11, 0])
}

/** An artwork start (D35): a PNG of that size uploaded as the template's artwork. */
async function artwork(width = 1200, height = 800) {
  const image = await uploadImage(db, actor, { bytes: await pngOf(width, height), name: 'artwork.png' })
  return { kind: 'artwork' as const, imageId: image.id }
}

/** A draft that passes the publish checks: it has an Order No. */
async function publishable(template: { id: string, design: SlipDesign, version: number }) {
  return updateTemplate(db, actor, template.id, { version: template.version, design: { ...template.design, elements: [createElement('orderNo', { id: 'no' })] } })
}
let names = 0
const create = async (start?: Parameters<typeof createTemplate>[2]['start'], name = `Template ${++names}`) => createTemplate(db, actor, { name, start: start ?? await artwork() })
const auditOf = (targetId: string) => db.select({ action: auditEvents.action, shopId: auditEvents.shopId, data: auditEvents.data }).from(auditEvents).where(eq(auditEvents.targetId, targetId)).orderBy(auditEvents.createdAt, auditEvents.id)

/** The design with one more field, labelled `label`. */
function withField(design: SlipDesign, label = 'សេវា'): SlipDesign {
  return { ...design, elements: [...design.elements, createElement('number', { id: `n${design.elements.length}` }, { label: { en: label, km: label } })] }
}

describe('images', () => {
  it('stores a PNG or JPEG with the type and size read from its bytes, and its audit row', async () => {
    const png = await pngOf(640, 400)
    const image = await uploadImage(db, actor, { bytes: png, name: 'Linda slip.png' })
    expect(image).toMatchObject({ name: 'Linda slip.png', type: 'image/png', width: 640, height: 400, size: png.byteLength })
    expect(await imageBytes(db, image.id)).toEqual({ bytes: png, type: 'image/png' })
    expect(await auditOf(image.id)).toEqual([{ action: 'image.upload', shopId: null, data: { type: 'image/png', width: 640, height: 400, size: png.byteLength } }])

    const jpeg = await uploadImage(db, actor, { bytes: jpegHeader(1600, 900), name: '' })
    expect(jpeg).toMatchObject({ name: 'Image.jpg', type: 'image/jpeg', width: 1600, height: 900 })
    expect(await getImage(db, jpeg.id)).toEqual(jpeg)
    expect((await listImages(db, { page: 1, pageSize: 1 }))).toMatchObject({ total: 2, items: [{ id: jpeg.id }] })
  })

  it('refuses what isn\'t a PNG or JPEG, an empty file, too big a file and a size out of range', async () => {
    expect(await refusal(uploadImage(db, actor, { bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'), name: '' }))).toBe('422 INVALID_IMAGE')
    expect(await refusal(uploadImage(db, actor, { bytes: new Uint8Array(), name: '' }))).toBe('422 INVALID_IMAGE')
    const huge = new Uint8Array(1024 * 1024 + 1)
    huge.set(jpegHeader(800, 800))
    expect(await refusal(uploadImage(db, actor, { bytes: huge, name: '' }))).toBe('422 INVALID_IMAGE')
    expect(await refusal(uploadImage(db, actor, { bytes: await pngOf(199, 400), name: '' }))).toBe('422 INVALID_IMAGE')
    expect(await refusal(uploadImage(db, actor, { bytes: jpegHeader(2001, 400), name: '' }))).toBe('422 INVALID_IMAGE')
    expect(await db.$count(images)).toBe(0)
    expect(await refusal(imageBytes(db, '0190f2a0-0000-7000-8000-000000000009'))).toBe('404 NOT_FOUND')
  })
})

describe('createTemplate', () => {
  it('starts from an artwork (its size, no fields yet) or as a copy of a draft', async () => {
    const start = await artwork(900, 600)
    const plain = await create(start, 'Wide slip')
    expect(plain).toMatchObject({ name: 'Wide slip', status: 'draft', version: 1, latestVersion: null, width: 900, height: 600, hasUnpublishedChanges: true })
    expect(plain.design).toEqual({ ...blankDesign(900, 600), background: { color: '#ffffff', imageId: start.imageId } })
    expect(await auditOf(plain.id)).toEqual([{ action: 'template.create', shopId: null, data: { start: 'artwork' } }])

    const edited = await updateTemplate(db, actor, plain.id, { version: 1, design: withField(plain.design) })
    const copy = await create({ kind: 'copy', templateId: plain.id }, 'Copy of Wide slip')
    expect(copy).toMatchObject({ status: 'draft', version: 1, latestVersion: null, design: edited.design })
    expect(copy.id).not.toBe(plain.id)

    expect(await auditOf(copy.id)).toEqual([{ action: 'template.create', shopId: null, data: { start: 'copy', from: plain.id } }])
  })

  it('refuses a name another template has, whatever its case, and an artwork or template that doesn\'t exist', async () => {
    await create(undefined, 'Linda')
    expect(await refusal(create(undefined, 'LINDA'))).toBe('409 TEMPLATE_NAME_TAKEN')
    const missing = '0190f2a0-0000-7000-8000-000000000009'
    expect(await refusal(create({ kind: 'artwork', imageId: missing }))).toBe('404 NOT_FOUND')
    expect(await refusal(create({ kind: 'copy', templateId: missing }))).toBe('404 NOT_FOUND')
    expect(await db.$count(templates)).toBe(1)
  })
})

describe('updateTemplate (autosave)', () => {
  it('saves the draft and the name at the version read, auditing only the rename', async () => {
    const template = await create(undefined, 'Draft')
    const saved = await updateTemplate(db, actor, template.id, { version: 1, design: withField(template.design) })
    expect(saved).toMatchObject({ version: 2, name: 'Draft', design: { elements: [{ type: 'number', label: { en: 'សេវា' } }] } })
    const renamed = await updateTemplate(db, actor, template.id, { version: 2, name: 'Linda slip' })
    expect(renamed).toMatchObject({ version: 3, name: 'Linda slip', design: saved.design })
    expect((await auditOf(template.id)).map(row => row.action)).toEqual(['template.create', 'template.rename'])
  })

  it('refuses a stale version and changes nothing', async () => {
    const template = await create()
    await updateTemplate(db, actor, template.id, { version: 1, design: withField(template.design, 'first') })
    expect(await refusal(updateTemplate(db, actor, template.id, { version: 1, design: withField(template.design, 'second') }))).toBe('409 VERSION_CONFLICT')
    expect((await getTemplate(db, template.id)).design.elements).toMatchObject([{ label: { en: 'first' } }])
  })

  it('refuses an artwork that was never uploaded, a taken name, an archived or a missing template', async () => {
    const template = await create(undefined, 'One')
    await create(undefined, 'Two')
    const missing = '0190f2a0-0000-7000-8000-000000000009'
    expect(await refusal(updateTemplate(db, actor, template.id, { version: 1, design: { ...template.design, background: { color: '#ffffff', imageId: missing } } }))).toBe('422 UNKNOWN_IMAGE')
    expect(await refusal(updateTemplate(db, actor, template.id, { version: 1, name: 'two' }))).toBe('409 TEMPLATE_NAME_TAKEN')
    expect(await refusal(updateTemplate(db, actor, missing, { version: 1, name: 'Three' }))).toBe('404 NOT_FOUND')

    await db.update(templates).set({ status: 'archived' }).where(eq(templates.id, template.id))
    expect(await refusal(updateTemplate(db, actor, template.id, { version: 1, name: 'Three' }))).toBe('409 INVALID_STATE')
  })
})

describe('publishTemplate', () => {
  it('fixes the draft as version 1, 2, … and says when the draft has changes to publish', async () => {
    const template = await publishable(await create())
    const first = await publishTemplate(db, actor, template.id, { version: 2 })
    expect(first).toMatchObject({ status: 'published', version: 3, latestVersion: 1, hasUnpublishedChanges: false })

    const edited = await updateTemplate(db, actor, template.id, { version: 3, design: withField(template.design) })
    expect(edited.hasUnpublishedChanges).toBe(true)
    const second = await publishTemplate(db, actor, template.id, { version: 4 })
    expect(second).toMatchObject({ latestVersion: 2, version: 5, hasUnpublishedChanges: false })

    const versions = await db.select({ number: templateVersions.number, design: templateVersions.design }).from(templateVersions).where(eq(templateVersions.templateId, template.id)).orderBy(templateVersions.number)
    expect(versions).toEqual([{ number: 1, design: template.design }, { number: 2, design: edited.design }])
    expect((await auditOf(template.id)).filter(row => row.action === 'template.publish').map(row => row.data)).toEqual([{ number: 1 }, { number: 2 }])
  })

  it('refuses a draft that fails the checks, a stale version, nothing new to publish, and an archived template', async () => {
    const draft = await create()
    expect(await refusal(publishTemplate(db, actor, draft.id, { version: 1 }))).toBe('422 PUBLISH_CHECKS_FAILED')
    const template = await publishable(draft)
    expect(await refusal(publishTemplate(db, actor, template.id, { version: 1 }))).toBe('409 VERSION_CONFLICT')
    await publishTemplate(db, actor, template.id, { version: 2 })
    expect(await refusal(publishTemplate(db, actor, template.id, { version: 3 }))).toBe('409 INVALID_STATE')
    await updateTemplate(db, actor, template.id, { version: 3, design: withField(template.design) })
    await db.update(templates).set({ status: 'archived' }).where(eq(templates.id, template.id))
    expect(await refusal(publishTemplate(db, actor, template.id, { version: 4 }))).toBe('409 INVALID_STATE')
    expect(await db.$count(templateVersions, eq(templateVersions.templateId, template.id))).toBe(1)
  })

  it('makes one version when two publishes of the same version race', async () => {
    const template = await publishable(await create())
    const results = await Promise.all([1, 2].map(() => refusal(publishTemplate(db, actor, template.id, { version: 2 }))))
    expect(results.sort()).toEqual(['409 VERSION_CONFLICT', 'allowed'])
    expect(await db.$count(templateVersions, and(eq(templateVersions.templateId, template.id), eq(templateVersions.number, 1)))).toBe(1)
  })
})

describe('listTemplates', () => {
  it('names each publish problem by its element', async () => {
    const template = await create()
    const twice = await updateTemplate(db, actor, template.id, { version: 1, design: { ...template.design, elements: [createElement('orderNo', { id: 'a' }), createElement('orderNo', { id: 'b' })] } })
    const error = await publishTemplate(db, actor, twice.id, { version: 2 }).catch((caught: { data: unknown }) => caught.data)
    expect(error).toEqual({ code: 'PUBLISH_CHECKS_FAILED', message: 'A fixed field is on the slip twice.', fieldErrors: { b: ['A fixed field is on the slip twice.'] } })
  })

  it('lists the latest changed first, leaves archived ones out unless asked, and searches the name', async () => {
    const a = await create(undefined, 'Linda slip')
    const b = await create(undefined, 'Sokha receipt')
    const c = await create(undefined, 'Old Linda')
    await db.update(templates).set({ status: 'archived' }).where(eq(templates.id, c.id))
    await updateTemplate(db, actor, a.id, { version: 1, name: 'Linda slip 2' }, new Date(Date.now() + 1000))

    const all = await listTemplates(db, { page: 1, pageSize: 20 })
    expect(all.items.map(item => item.id)).toEqual([a.id, b.id])
    expect(all.items[0]).toEqual({ id: a.id, name: 'Linda slip 2', status: 'draft', width: 1200, height: 800, latestVersion: null, shopCount: 0, version: 2, createdAt: a.createdAt, updatedAt: expect.any(String), design: a.design })
    expect((await listTemplates(db, { status: 'archived', page: 1, pageSize: 20 })).items.map(item => item.id)).toEqual([c.id])
    expect((await listTemplates(db, { search: 'linda', page: 1, pageSize: 20 })).items.map(item => item.id)).toEqual([a.id])
    expect(await listTemplates(db, { page: 2, pageSize: 1 })).toMatchObject({ total: 2, items: [{ id: b.id }] })
  })
})

describe('previewTemplate', () => {
  it('draws the design on screen as a PNG of the canvas\'s size, with its artwork', async () => {
    const template = await create(await artwork(600, 1000))
    const design: SlipDesign = { ...withField(template.design, 'ហាងបោកអ៊ុត'), background: { ...template.design.background, color: '#fffbeb' } }
    const png = await previewTemplate(db, template.id, { design })
    expect(imageInfo(png)).toEqual({ type: 'image/png', width: 600, height: 1000 })
  })

  it('refuses an artwork that was never uploaded, and a missing template', async () => {
    const template = await create()
    const missing = '0190f2a0-0000-7000-8000-000000000009'
    expect(await refusal(previewTemplate(db, template.id, { design: { ...template.design, background: { color: '#ffffff', imageId: missing } } }))).toBe('422 UNKNOWN_IMAGE')
    expect(await refusal(previewTemplate(db, missing, { design: template.design }))).toBe('404 NOT_FOUND')
  })
})
