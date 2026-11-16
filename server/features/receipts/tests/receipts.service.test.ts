import * as v from 'valibot'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ReceiptField } from '#shared/contracts/receipts'
import { createOrderSchema } from '#shared/contracts/orders'
import { authorizeShop } from '#server/features/identity'
import type { ShopActor } from '#server/features/identity'
import { createPriceItem, createServiceType } from '#server/features/pricing'
import { createOrder } from '#server/features/orders'
import { getReceiptDesign, orderReceipt, previewReceipt, receiptBackground, renderOrderReceipt, updateReceiptFields, uploadReceiptBackground } from '#server/features/receipts'
import { receiptSvg } from '#server/features/receipts/receipts.render'
import { auditEvents } from '#server/features/platform/platform.schema'
import type { Db } from '#server/utils/batch'
import { createTestDb } from '#server/tests/support/db'
import { createOwner, createTestUser } from '#server/tests/support/auth'
import { pngOf } from './images'

// Receipt designs (D28) against SQLite built from the migrations, always with two shops. The
// platform acts in a shop as `platformShopActor` returns it: the admin's id with the shop's.

let db: Db
let a: ShopActor
let b: ShopActor
let adminId: string
/** The platform acting in shop A, and in shop B. */
const inShop = (actor: ShopActor) => ({ userId: adminId, shopId: actor.shopId, requestId: 'req-9' })
let shirt: string
let wash: string
let otherShopShirt: string

const actorOf = async (userId: string) => ({ ...await authorizeShop({ db, user: { id: userId, role: 'user' }, permissions: { order: ['create'] } }), requestId: 'req-1' })

beforeEach(async () => {
  db = await createTestDb()
  a = await actorOf((await createOwner(db)).userId)
  b = await actorOf((await createOwner(db)).userId)
  adminId = (await createTestUser(db, { role: 'superadmin' })).userId
  const type = await createServiceType(db, a, { nameEn: 'Wash & iron', nameKm: 'បោកអ៊ុត' })
  wash = type.id
  shirt = (await createPriceItem(db, a, { serviceTypeId: type.id, nameEn: 'Shirt', nameKm: 'អាវ', unit: 'piece', price: 2000 })).id
  const otherType = await createServiceType(db, b, { nameEn: 'Wash', nameKm: null })
  otherShopShirt = (await createPriceItem(db, b, { serviceTypeId: otherType.id, nameEn: 'Shirt', nameKm: null, unit: 'piece', price: 1000 })).id
})

function refusal(promise: Promise<unknown>) {
  return promise.then(() => 'allowed', (error: { statusCode?: number, data?: { code?: string }, message?: string }) =>
    error.statusCode ? `${error.statusCode} ${error.data?.code}` : `error: ${error.message}`)
}

/** Runs `meanwhile` (another tab's write) after the service's reads, right before its batch. */
function beforeNextBatch(meanwhile: () => Promise<unknown>) {
  const realBatch = db.batch.bind(db)
  db.batch = (async (statements: never) => {
    db.batch = realBatch
    await meanwhile()
    return realBatch(statements)
  }) as unknown as Db['batch']
}

const style = { size: 30, color: '#111111', align: 'start' as const, bold: false }
const fieldsOf = (priceItemId = shirt, serviceTypeId = wash): ReceiptField[] => [
  { kind: 'text', id: 'number', x: 20, y: 40, ...style, source: 'number' },
  { kind: 'quantity', id: 'shirt', x: 20, y: 80, ...style, priceItemId },
  { kind: 'check', id: 'paid', x: 20, y: 100, size: 30, color: '#111111', when: 'paid' },
  { kind: 'serviceCheck', id: 'wash', x: 60, y: 100, size: 30, color: '#111111', serviceTypeId },
]

async function designFor(actor: ShopActor) {
  return uploadReceiptBackground(db, inShop(actor), { bytes: await pngOf(400, 300) })
}

let keys = 0
async function orderIn(actor: ShopActor, lines = [{ priceItemId: shirt, quantity: 3 }]) {
  const input = v.parse(createOrderSchema, { customer: { kind: 'counter', phone: '', name: '' }, lines, note: '', paid: true })
  return (await createOrder(db, actor, input, `0190${String(++keys).padStart(4, '0')}-0000-7000-8000-000000000000`)).order
}

describe('the background', () => {
  it('makes the shop\'s design from the image\'s own type and size, audited in that shop\'s history', async () => {
    const design = await designFor(a)
    expect(design).toMatchObject({ imageType: 'image/png', width: 400, height: 300, fields: [], version: 1 })
    expect((await getReceiptDesign(db, inShop(a))).design).toEqual(design)
    expect((await getReceiptDesign(db, inShop(b))).design).toBeNull()
    const [row] = await db.select().from(auditEvents).where(eq(auditEvents.action, 'receipt.background'))
    expect(row).toMatchObject({ shopId: a.shopId, actorUserId: adminId, targetType: 'receipt', targetId: a.shopId, requestId: 'req-9', data: { imageType: 'image/png', width: 400, height: 300 } })
    const stored = await receiptBackground(db, inShop(a))
    expect(stored.type).toBe('image/png')
    expect([...stored.bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4E, 0x47])
  })

  it('replaces the image at the version read and keeps the fields', async () => {
    await designFor(a)
    await updateReceiptFields(db, inShop(a), { version: 1, fields: fieldsOf() })
    const replaced = await uploadReceiptBackground(db, inShop(a), { bytes: await pngOf(500, 600), version: 2 })
    expect(replaced).toMatchObject({ width: 500, height: 600, version: 3 })
    expect(replaced.fields).toHaveLength(4)
  })

  it('refuses a second design, a stale or missing one, and files that aren\'t a usable image', async () => {
    expect(await refusal(uploadReceiptBackground(db, inShop(a), { bytes: await pngOf(400, 300), version: 1 }))).toBe('404 NOT_FOUND')
    await designFor(a)
    expect(await refusal(designFor(a))).toBe('409 VERSION_CONFLICT')
    expect(await refusal(uploadReceiptBackground(db, inShop(a), { bytes: await pngOf(400, 300), version: 7 }))).toBe('409 VERSION_CONFLICT')
    expect(await refusal(uploadReceiptBackground(db, inShop(b), { bytes: new TextEncoder().encode('<svg></svg>') }))).toBe('400 RECEIPT_IMAGE_INVALID')
    expect(await refusal(uploadReceiptBackground(db, inShop(b), { bytes: await pngOf(150, 300) }))).toBe('400 RECEIPT_IMAGE_SIZE')
    expect(await refusal(uploadReceiptBackground(db, inShop(b), { bytes: new Uint8Array(1_000_001) }))).toBe('400 RECEIPT_IMAGE_INVALID')
  })

  it('a change made meanwhile stops the replacement', async () => {
    await designFor(a)
    beforeNextBatch(() => updateReceiptFields(db, inShop(a), { version: 1, fields: [] }))
    expect(await refusal(uploadReceiptBackground(db, inShop(a), { bytes: await pngOf(500, 500), version: 1 }))).toBe('409 VERSION_CONFLICT')
    expect((await getReceiptDesign(db, inShop(a))).design).toMatchObject({ width: 400, version: 2 })
  })
})

describe('the fields', () => {
  it('saves them at the version read, audited', async () => {
    await designFor(a)
    const saved = await updateReceiptFields(db, inShop(a), { version: 1, fields: fieldsOf() })
    expect(saved).toMatchObject({ version: 2, fields: fieldsOf() })
    expect(await refusal(updateReceiptFields(db, inShop(a), { version: 1, fields: [] }))).toBe('409 VERSION_CONFLICT')
    const audits = await db.select().from(auditEvents).where(eq(auditEvents.action, 'receipt.update'))
    expect(audits).toMatchObject([{ shopId: a.shopId, data: { fields: 4 } }])
  })

  it('names only this shop\'s price items and services', async () => {
    await designFor(a)
    await designFor(b)
    expect(await refusal(updateReceiptFields(db, inShop(a), { version: 1, fields: fieldsOf(otherShopShirt) }))).toBe('400 VALIDATION_FAILED')
    expect(await refusal(updateReceiptFields(db, inShop(b), { version: 1, fields: fieldsOf(otherShopShirt, wash) }))).toBe('400 VALIDATION_FAILED')
    expect(await refusal(previewReceipt(db, inShop(b), { fields: fieldsOf() }))).toBe('400 VALIDATION_FAILED')
    // Shop B's design is untouched by shop A's.
    await updateReceiptFields(db, inShop(a), { version: 1, fields: fieldsOf() })
    expect((await getReceiptDesign(db, inShop(b))).design).toMatchObject({ version: 1, fields: [] })
  })

  it('a change made meanwhile stops the save', async () => {
    await designFor(a)
    const bytes = await pngOf(500, 500)
    beforeNextBatch(() => uploadReceiptBackground(db, inShop(a), { bytes, version: 1 }))
    expect(await refusal(updateReceiptFields(db, inShop(a), { version: 1, fields: fieldsOf() }))).toBe('409 VERSION_CONFLICT')
    expect((await getReceiptDesign(db, inShop(a))).design?.fields).toEqual([])
  })

  it('needs a design first', async () => {
    expect(await refusal(updateReceiptFields(db, inShop(a), { version: 1, fields: [] }))).toBe('404 NOT_FOUND')
    expect(await refusal(previewReceipt(db, inShop(a), { fields: [] }))).toBe('404 NOT_FOUND')
    expect(await refusal(receiptBackground(db, inShop(a)))).toBe('404 NOT_FOUND')
  })
})

describe('an order\'s receipt', () => {
  it('is a PNG of the design filled with the order, at the background\'s size', async () => {
    await designFor(a)
    await updateReceiptFields(db, inShop(a), { version: 1, fields: fieldsOf() })
    const order = await orderIn(a)
    const png = await renderOrderReceipt(db, a.shopId, order.id)
    expect([...png!.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4E, 0x47])
    // IHDR: width and height, big-endian.
    const view = new DataView(png!.buffer, png!.byteOffset)
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([400, 300])
    expect((await orderReceipt(db, a, order.id)).byteLength).toBe(png!.byteLength)
  })

  it('is nothing without a design (Telegram sends text), and 404 on the shop\'s page', async () => {
    const order = await orderIn(a)
    expect(await renderOrderReceipt(db, a.shopId, order.id)).toBeNull()
    expect(await refusal(orderReceipt(db, a, order.id))).toBe('404 NOT_FOUND')
  })

  it('never reaches another shop\'s order, design or no design', async () => {
    await designFor(a)
    await designFor(b)
    const order = await orderIn(a)
    expect(await refusal(orderReceipt(db, b, order.id))).toBe('404 NOT_FOUND')
    expect(await refusal(renderOrderReceipt(db, b.shopId, order.id))).toBe('404 NOT_FOUND')
  })
})

describe('receiptSvg', () => {
  const background = { image: '', imageType: 'image/png' as const, width: 400, height: 300 }
  const values = {
    text: { shopName: 'ស្ត្រី ក្រុមហ៊ុន', number: '61', date: '', customer: 'A ក្រ B', phone: '', total: '13,500៛', payment: '', note: '<b>&</b>' },
    quantities: { [`${'0'.repeat(8)}-0000-7000-8000-000000000001`]: '2.5 kg' },
    paid: false,
    services: [],
  }
  const textAt = (svg: string) => [...svg.matchAll(/<text x="([\d.-]+)"[^>]*>([^<]*)<\/text>/g)].map(match => [Number(match[1]), match[2]])

  it('draws each word on its own, left to right, so resvg keeps the spaces (D28)', async () => {
    const svg = await receiptSvg(background, [{ kind: 'text', id: 'a', x: 10, y: 40, ...style, source: 'shopName' }, { kind: 'text', id: 'b', x: 10, y: 80, ...style, source: 'customer' }], values)
    const words = textAt(svg)
    expect(words.map(([, word]) => word)).toEqual(['ស្ត្រី', 'ក្រុមហ៊ុន', 'A', 'ក្រ', 'B'])
    expect(words[1]![0]).toBeGreaterThan(words[0]![0] as number)
    expect(words[3]![0]).toBeGreaterThan(words[2]![0] as number)
  })

  it('centres or right-aligns the whole line on its point', async () => {
    const field = (align: 'start' | 'middle' | 'end') => ({ kind: 'text' as const, id: align, x: 200, y: 40, ...style, align, source: 'total' as const })
    const [start] = textAt(await receiptSvg(background, [field('start')], values))
    const [middle] = textAt(await receiptSvg(background, [field('middle')], values))
    const [end] = textAt(await receiptSvg(background, [field('end')], values))
    expect(start![0]).toBeGreaterThan(middle![0] as number)
    expect(middle![0]).toBeGreaterThan(end![0] as number)
  })

  it('escapes text, leaves blank fields out, and draws ticks only when they apply', async () => {
    const svg = await receiptSvg(background, [
      { kind: 'text', id: 'note', x: 10, y: 40, ...style, source: 'note' },
      { kind: 'text', id: 'phone', x: 10, y: 40, ...style, source: 'phone' },
      { kind: 'quantity', id: 'kg', x: 10, y: 40, ...style, priceItemId: `${'0'.repeat(8)}-0000-7000-8000-000000000001` },
      { kind: 'check', id: 'paid', x: 10, y: 10, size: 20, color: '#000000', when: 'paid' },
      { kind: 'check', id: 'unpaid', x: 10, y: 10, size: 20, color: '#000000', when: 'unpaid' },
    ], values)
    expect(textAt(svg).map(([, word]) => word)).toEqual(['&lt;b&gt;&amp;&lt;/b&gt;', '2.5', 'kg'])
    expect(svg.match(/<path /g)).toHaveLength(1)
  })
})
