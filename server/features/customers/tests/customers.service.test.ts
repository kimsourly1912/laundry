import * as v from 'valibot'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { CustomerInput } from '#shared/contracts/customers'
import { customerInputSchema } from '#shared/contracts/customers'
import { authorizeShop } from '#server/features/identity'
import type { ShopActor } from '#server/features/identity'
import { anonymizeCustomer, createCustomer, getCustomer, listCustomers, updateCustomer } from '#server/features/customers'
import { phoneSearchDigits } from '#server/features/customers/customers.service'
import { customers } from '#server/features/customers/customers.schema'
import { auditEvents } from '#server/features/platform/platform.schema'
import type { Db } from '#server/utils/batch'
import { createTestDb } from '#server/tests/support/db'
import { createOwner } from '#server/tests/support/auth'

// A shop's customers (M2.2), always two shops apart.

let db: Db
let a: ShopActor
let b: ShopActor

const actorOf = async (userId: string) => authorizeShop({ db, user: { id: userId, role: 'user' }, permissions: { customer: ['write'] } })

beforeEach(async () => {
  db = await createTestDb()
  a = await actorOf((await createOwner(db)).userId)
  b = await actorOf((await createOwner(db)).userId)
})

function refusal(promise: Promise<unknown>) {
  return promise.then(() => 'allowed', (error: { statusCode?: number, data?: { code?: string }, message?: string }) =>
    error.statusCode ? `${error.statusCode} ${error.data?.code}` : `error: ${error.message}`)
}

/** As the route receives it: through the contract (phone normalized to E.164). */
const input = (raw: { name: string, phone?: string, note?: string }): CustomerInput => v.parse(customerInputSchema, { phone: '', note: '', ...raw })
const query = (search?: string, page = 1, pageSize = 20) => ({ search, page, pageSize })

describe('customers', () => {
  it('creates with the phone in E.164; the same number typed another way is the same customer', async () => {
    const sokha = await createCustomer(db, a, input({ name: 'Sokha', phone: '012 345 678' }))
    expect(sokha).toMatchObject({ name: 'Sokha', phone: '+85512345678', anonymized: false, version: 1 })
    expect(await refusal(createCustomer(db, a, input({ name: 'Other', phone: '+855 12 345 678' })))).toBe('409 PHONE_TAKEN')
    // Another shop may have a customer with the same phone.
    expect(await refusal(createCustomer(db, b, input({ name: 'Sokha at B', phone: '012345678' })))).toBe('allowed')
  })

  it('a customer may have no phone; several without one', async () => {
    await createCustomer(db, a, input({ name: 'No phone 1' }))
    expect(await refusal(createCustomer(db, a, input({ name: 'No phone 2' })))).toBe('allowed')
  })

  it('lists only the actor\'s shop, newest change first, a page at a time', async () => {
    for (const name of ['Dara', 'Sokha', 'Vanna']) await createCustomer(db, a, input({ name }))
    await createCustomer(db, b, input({ name: 'Other shop' }))
    const page = await listCustomers(db, a, query(undefined, 1, 2))
    expect(page).toMatchObject({ total: 3, page: 1, pageSize: 2 })
    expect(page.items.map(c => c.name)).toEqual(['Vanna', 'Sokha'])
    expect((await listCustomers(db, a, query(undefined, 2, 2))).items.map(c => c.name)).toEqual(['Dara'])
  })

  it('searches by name (any case) or by phone digits in any format; never another shop\'s', async () => {
    await createCustomer(db, a, input({ name: 'Sokha Chan', phone: '012 345 678' }))
    await createCustomer(db, a, input({ name: 'Dara', phone: '097 777 7777' }))
    await createCustomer(db, b, input({ name: 'Sokha B', phone: '012 345 678' }))
    const names = async (search: string) => (await listCustomers(db, a, query(search))).items.map(c => c.name)
    expect(await names('sokha')).toEqual(['Sokha Chan'])
    expect(await names('012 345')).toEqual(['Sokha Chan'])
    expect(await names('345678')).toEqual(['Sokha Chan'])
    expect(await names('+855 97')).toEqual(['Dara'])
    expect(await names('zzz')).toEqual([])
  })

  it('phoneSearchDigits: the national number\'s digits, at least 3', () => {
    expect(phoneSearchDigits('012 345')).toBe('12345')
    expect(phoneSearchDigits('+855 12')).toBe('85512')
    expect(phoneSearchDigits('01')).toBeUndefined()
    expect(phoneSearchDigits('Sokha')).toBeUndefined()
  })

  it('reads one: another shop\'s is 404', async () => {
    const sokha = await createCustomer(db, a, input({ name: 'Sokha' }))
    expect((await getCustomer(db, a, sokha.id)).name).toBe('Sokha')
    expect(await refusal(getCustomer(db, b, sokha.id))).toBe('404 NOT_FOUND')
  })

  it('edits at the version read; another shop\'s 404; stale 409; a taken phone 409; audit names fields only', async () => {
    const sokha = await createCustomer(db, a, input({ name: 'Sokha', phone: '012 345 678' }))
    await createCustomer(db, a, input({ name: 'Dara', phone: '097 777 7777' }))
    const edit = (version: number, raw: { name: string, phone?: string, note?: string }) => ({ ...input(raw), version })
    expect(await refusal(updateCustomer(db, b, sokha.id, edit(1, { name: 'Mine' })))).toBe('404 NOT_FOUND')
    expect(await refusal(updateCustomer(db, a, sokha.id, edit(1, { name: 'Sokha', phone: '097 777 7777' })))).toBe('409 PHONE_TAKEN')
    const updated = await updateCustomer(db, a, sokha.id, edit(1, { name: 'Sokha Chan', phone: '012 345 678', note: 'Likes starch' }))
    expect(updated).toMatchObject({ name: 'Sokha Chan', note: 'Likes starch', version: 2 })
    expect(await refusal(updateCustomer(db, a, sokha.id, edit(1, { name: 'Late' })))).toBe('409 VERSION_CONFLICT')
    const [row] = await db.select().from(auditEvents).where(eq(auditEvents.action, 'customer.update'))
    expect(row).toMatchObject({ shopId: a.shopId, targetId: sokha.id, data: { fields: ['name', 'note'] } })
    expect(JSON.stringify(row)).not.toContain('Likes starch')
  })

  it('anonymizes: name, phone and note cleared, the phone free again, never edited after; not by another shop', async () => {
    const sokha = await createCustomer(db, a, input({ name: 'Sokha', phone: '012 345 678', note: 'VIP' }))
    expect(await refusal(anonymizeCustomer(db, b, sokha.id, { version: 1 }))).toBe('404 NOT_FOUND')
    const gone = await anonymizeCustomer(db, a, sokha.id, { version: 1 })
    expect(gone).toMatchObject({ name: '', phone: null, note: null, anonymized: true, version: 2 })
    const [stored] = await db.select().from(customers).where(eq(customers.id, sokha.id))
    expect([stored!.name, stored!.phoneE164, stored!.note]).toEqual(['', null, null])
    // Not in the list or search; its phone is free for a new customer.
    expect((await listCustomers(db, a, query())).items).toEqual([])
    expect(await refusal(createCustomer(db, a, input({ name: 'New Sokha', phone: '012 345 678' })))).toBe('allowed')
    expect(await refusal(updateCustomer(db, a, sokha.id, { ...input({ name: 'Back' }), version: 2 }))).toBe('409 INVALID_STATE')
    expect(await refusal(anonymizeCustomer(db, a, sokha.id, { version: 2 }))).toBe('409 INVALID_STATE')
    expect(await db.$count(auditEvents, eq(auditEvents.action, 'customer.anonymize'))).toBe(1)
  })

  it('two saves of one version at once: one wins, the other 409 (changed, or anonymized meanwhile)', async () => {
    const sokha = await createCustomer(db, a, input({ name: 'Sokha' }))
    const results = await Promise.all([
      refusal(updateCustomer(db, a, sokha.id, { ...input({ name: 'One' }), version: 1 })),
      refusal(anonymizeCustomer(db, a, sokha.id, { version: 1 })),
    ])
    expect(results.filter(result => result === 'allowed')).toHaveLength(1)
    expect(results.find(result => result !== 'allowed')).toMatch(/^409 (VERSION_CONFLICT|INVALID_STATE)$/)
    expect((await getCustomer(db, a, sokha.id)).version).toBe(2)
  })
})
