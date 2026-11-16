import type { Page } from '#shared/contracts/common'
import { toPage } from '#shared/contracts/common'
import type { AnonymizeCustomerInput, Customer, CustomerInput, CustomerListQuery, UpdateCustomerInput } from '#shared/contracts/customers'
import type { Db, Statement } from '#server/utils/batch'
import { isStaleWrite, isUniqueViolation, requireOneChange } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { auditStatement } from '#server/features/platform'
import type { ShopActor } from '#server/features/identity'
import { customerAnonymized, customerChanged, customerNotFound, phoneTaken } from './customers.errors'
import * as repo from './customers.repository'
import type { CustomerRow } from './customers.repository'

/**
 * A shop's customers (spec §9 → Shop, step M2.2). Every query is the actor's shop's. Phones arrive
 * normalized to E.164 by the contract; one customer per phone in a shop, by a unique index. Writes
 * are one batch with their audit row, which names fields, never their values (personal data).
 */

const toCustomer = (row: CustomerRow): Customer => ({
  id: row.id,
  name: row.name,
  phone: row.phoneE164,
  note: row.note,
  anonymized: row.anonymizedAt !== null,
  createdAt: row.createdAt.toISOString(),
  version: row.version,
})

function audit(db: Db, actor: ShopActor, action: string, id: string, now: Date, data?: Record<string, unknown>): Statement {
  return auditStatement(db, { userId: actor.userId, shopId: actor.shopId, requestId: actor.requestId }, { action, targetType: 'customer', targetId: id, data }, now)
}

/**
 * The digits of a phone search inside an E.164 number: `012 345` → `12345` (the leading 0 is
 * Cambodia's trunk prefix, not part of `+85512345…`). At least 3 digits, else not a phone search.
 */
export function phoneSearchDigits(search: string): string | undefined {
  if (!/^[\d\s+()-]+$/.test(search)) return undefined
  const digits = search.replace(/\D/g, '').replace(/^0/, '')
  return digits.length >= 3 ? digits : undefined
}

export async function listCustomers(db: Db, actor: ShopActor, query: CustomerListQuery): Promise<Page<Customer>> {
  const { search, page, pageSize } = query
  const { rows, total } = await repo.listCustomers(db, actor.shopId, {
    text: search,
    phoneDigits: search ? phoneSearchDigits(search) : undefined,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  })
  return toPage(rows.map(toCustomer), query, total)
}

export async function getCustomer(db: Db, actor: ShopActor, id: string): Promise<Customer> {
  const row = await repo.findCustomer(db, actor.shopId, id)
  if (!row) throw customerNotFound()
  return toCustomer(row)
}

/** Runs the batch; a duplicate phone is 409 `PHONE_TAKEN`, a stopped guard what `stale` says. */
async function run(db: Db, statements: Statement[], stale: () => Promise<Error>) {
  try {
    await db.batch(statements as [Statement, ...Statement[]])
  }
  catch (error) {
    if (isUniqueViolation(error)) throw phoneTaken()
    if (isStaleWrite(error)) throw await stale()
    throw error
  }
}

export async function createCustomer(db: Db, actor: ShopActor, input: CustomerInput, now = new Date()): Promise<Customer> {
  const id = newId()
  await run(db, [
    repo.insertCustomerStatement(db, { shopId: actor.shopId, id, name: input.name, phoneE164: input.phone, note: input.note, now }),
    audit(db, actor, 'customer.create', id, now),
  ], async () => customerChanged())
  return getCustomer(db, actor, id)
}

/** Why a customer's guarded write stopped: missing (or another shop's), anonymized, or changed. */
function explain(db: Db, shopId: string, id: string): () => Promise<Error> {
  return async () => {
    const current = await repo.findCustomer(db, shopId, id)
    if (!current) return customerNotFound()
    if (current.anonymizedAt) return customerAnonymized()
    return customerChanged()
  }
}

export async function updateCustomer(db: Db, actor: ShopActor, id: string, input: UpdateCustomerInput, now = new Date()): Promise<Customer> {
  const { shopId } = actor
  const before = await repo.findCustomer(db, shopId, id)
  if (!before) throw customerNotFound()
  const fields = { name: input.name, phoneE164: input.phone, note: input.note }
  const changed = (['name', 'phoneE164', 'note'] as const).filter(field => before[field] !== fields[field]).map(field => (field === 'phoneE164' ? 'phone' : field))
  await run(db, [
    repo.updateCustomerStatement(db, { shopId, id, version: input.version }, fields, now),
    requireOneChange(db),
    audit(db, actor, 'customer.update', id, now, { fields: changed }),
  ], explain(db, shopId, id))
  return getCustomer(db, actor, id)
}

/**
 * Anonymizes a customer (spec P11): name, phone and note cleared, the phone free for reuse, orders
 * kept and shown as "Former customer". Telegram links are revoked here too once they exist (M4).
 */
export async function anonymizeCustomer(db: Db, actor: ShopActor, id: string, input: AnonymizeCustomerInput, now = new Date()): Promise<Customer> {
  const { shopId } = actor
  await run(db, [
    repo.anonymizeStatement(db, { shopId, id, version: input.version }, now),
    requireOneChange(db),
    audit(db, actor, 'customer.anonymize', id, now),
  ], explain(db, shopId, id))
  return getCustomer(db, actor, id)
}

// --- For the orders feature ---

/** Guards an order's customer: still the shop's and not anonymized when the batch runs. */
export function requireActiveCustomerStatement(db: Db, shopId: string, id: string): Statement {
  return repo.requireActiveCustomer(db, shopId, id)
}

/**
 * The person at the counter (D27), for a new order's batch: with a phone, the shop's customer with
 * that phone (anonymized ones have none), else a new customer with this phone and name; with no
 * phone, a new walk-in customer with only the name given, which may be blank. A new customer is
 * audited like any other. Two orders making the same new phone's customer at once: one batch fails
 * on the phone's unique index, and its caller resolves again (the customer exists then).
 */
export async function counterCustomer(db: Db, actor: ShopActor, input: { phone: string | null, name: string }, now: Date): Promise<{ id: string, statements: Statement[] }> {
  const { shopId } = actor
  const { phone, name } = input
  const existing = phone ? await repo.findByPhone(db, shopId, phone) : undefined
  if (existing) return { id: existing.id, statements: [repo.requireActiveCustomer(db, shopId, existing.id)] }
  const id = newId()
  return {
    id,
    statements: [
      repo.insertCustomerStatement(db, { shopId, id, name, phoneE164: phone, note: null, now }),
      audit(db, actor, 'customer.create', id, now, { via: 'order' }),
    ],
  }
}
