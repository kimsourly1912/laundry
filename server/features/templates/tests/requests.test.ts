import { beforeEach, describe, expect, it } from 'vitest'
import { blankDesign } from '#shared/contracts/slip-design'
import { SAMPLE_SHOP } from '#shared/slip/fields'
import { createRequest, getRequest, requestPhoto, requestQueue, setRequestStatus, shopRequests } from '#server/features/templates'
import { renderSlipPng } from '#server/features/templates/templates.render'
import { auditEvents } from '#server/features/platform/platform.schema'
import type { PlatformActor, ShopActor } from '#server/features/identity'
import type { Db } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { createTestDb } from '#server/tests/support/db'
import { createOwner, createTestUser } from '#server/tests/support/auth'
import { createTestTemplate } from '#server/tests/support/slips'

// Redesign requests (D39): an owner sends a photo and what they want; the platform's queue moves
// them on. The photo is its shop's and the platform's only.

let db: Db
let a: ShopActor
let b: ShopActor
let platform: PlatformActor
let photo: Uint8Array

const actorOf = (owner: { shopId: string, userId: string }): ShopActor => ({ userId: owner.userId, shopId: owner.shopId, role: 'owner', statements: [] })

beforeEach(async () => {
  db = await createTestDb()
  a = actorOf(await createOwner(db, { name: 'Alpha Wash' }))
  b = actorOf(await createOwner(db, { name: 'Beta Wash' }))
  const admin = await createTestUser(db, { role: 'superadmin' })
  platform = { userId: admin.userId, platformRole: 'superadmin' }
  photo = await renderSlipPng({ design: blankDesign(600, 400), data: { values: {}, order: { number: null, date: null, phone: null, amount: null, paid: null }, shop: SAMPLE_SHOP }, images: new Map() })
})

function refusal(promise: Promise<unknown>) {
  return promise.then(() => 'allowed', (error: { statusCode?: number, data?: { code?: string } }) => `${error.statusCode} ${error.data?.code}`)
}

describe('redesign requests', () => {
  it('an owner sends a photo with what they want; the platform sees it in its queue, oldest first, with the shop', async () => {
    const first = await createRequest(db, a, { bytes: photo, query: { kind: 'keep', notes: 'Same layout, bigger boxes' } }, new Date('2026-11-18T01:00:00Z'))
    await createRequest(db, b, { bytes: photo, query: { kind: 'redesign', notes: '' } }, new Date('2026-11-18T02:00:00Z'))
    expect(first).toMatchObject({ kind: 'keep', notes: 'Same layout, bigger boxes', status: 'new', templateId: null, photo: { type: 'image/png', width: 600, height: 400 }, version: 1 })
    const queue = await requestQueue(db, { page: 1, pageSize: 20 })
    expect(queue.items.map(item => [item.shopName, item.kind])).toEqual([['Alpha Wash', 'keep'], ['Beta Wash', 'redesign']])
    expect((await shopRequests(db, a)).map(item => item.id)).toEqual([first.id])
    expect(await db.$count(auditEvents)).toBe(2)
  })

  it('refuses anything but a PNG or JPEG of 200–2000 px (422)', async () => {
    expect(await refusal(createRequest(db, a, { bytes: new TextEncoder().encode('not an image'), query: { kind: 'keep', notes: '' } }))).toBe('422 INVALID_IMAGE')
    const tiny = await renderSlipPng({ design: blankDesign(200, 200), data: { values: {}, order: { number: null, date: null, phone: null, amount: null, paid: null }, shop: SAMPLE_SHOP }, images: new Map() })
    expect((await createRequest(db, a, { bytes: tiny, query: { kind: 'keep', notes: '' } })).photo.width).toBe(200)
  })

  it('the platform moves it on at the version read, and names the template made; a stale or unknown one is refused', async () => {
    const request = await createRequest(db, a, { bytes: photo, query: { kind: 'redesign', notes: '' } })
    const working = await setRequestStatus(db, platform, request.id, { version: 1, status: 'in_progress', templateId: null })
    expect(working).toMatchObject({ status: 'in_progress', version: 2 })
    expect(await refusal(setRequestStatus(db, platform, request.id, { version: 1, status: 'done', templateId: null }))).toBe('409 VERSION_CONFLICT')
    expect(await refusal(setRequestStatus(db, platform, request.id, { version: 2, status: 'done', templateId: newId() }))).toBe('404 NOT_FOUND')
    const { templateId } = await createTestTemplate(db, platform.userId)
    const done = await setRequestStatus(db, platform, request.id, { version: 2, status: 'done', templateId })
    expect(done).toMatchObject({ status: 'done', templateId })
    expect((await shopRequests(db, a))[0]).toMatchObject({ status: 'done', templateId })
    expect((await requestQueue(db, { page: 1, pageSize: 20, status: 'done' })).total).toBe(1)
  })

  it('the photo is its shop\'s and the platform\'s only: another shop gets 404', async () => {
    const request = await createRequest(db, a, { bytes: photo, query: { kind: 'keep', notes: '' } })
    expect((await requestPhoto(db, request.id, a.shopId)).bytes.byteLength).toBe(photo.byteLength)
    expect((await requestPhoto(db, request.id)).type).toBe('image/png')
    expect(await refusal(requestPhoto(db, request.id, b.shopId))).toBe('404 NOT_FOUND')
    expect(await shopRequests(db, b)).toEqual([])
    expect((await getRequest(db, request.id)).shopName).toBe('Alpha Wash')
  })
})
