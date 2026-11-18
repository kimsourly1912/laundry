import type { Page } from '#shared/contracts/common'
import { toPage } from '#shared/contracts/common'
import type { CreateCustomerInput, Customer, CustomerListQuery, UpdateCustomerInput } from '#shared/contracts/customers'
import { toE164 } from '#shared/contracts/phone'
import type { Db } from '#server/utils/batch'
import { isUniqueViolation, requireOneChange, runBatch } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { auditStatement } from '#server/features/platform'
import type { ShopActor } from '#server/features/identity'
import { customerChanged, customerNotFound, phoneTaken } from './customers.errors'
import * as repo from './customers.repository'
import type { CustomerRow } from './customers.repository'

/**
 * The shop's customers (D39; product notes → customers): find one at the counter by phone or name,
 * add one, correct one at the version read. Audit rows say which fields changed, never the values
 * (personal data, docs/server/security.md → Logging and privacy).
 */

function toCustomer(row: CustomerRow): Customer {
  return { ...row, createdAt: row.createdAt.toISOString() }
}

export async function getCustomer(db: Db, actor: ShopActor, customerId: string): Promise<Customer> {
  const row = await repo.findCustomer(db, actor.shopId, customerId)
  if (!row) throw customerNotFound()
  return toCustomer(row)
}

/** `search` that reads as a phone matches the phone exactly; anything else, part of the name. */
export async function listCustomers(db: Db, actor: ShopActor, query: CustomerListQuery): Promise<Page<Customer>> {
  const { search, page, pageSize } = query
  const phone = search ? toE164(search) ?? undefined : undefined
  const { rows, total } = await repo.listCustomers(db, actor.shopId, { page, pageSize, phone, name: phone ? undefined : search })
  return toPage(rows.map(toCustomer), query, total)
}

/** A new customer; 409 `PHONE_TAKEN` when another of the shop's has the phone. */
export async function createCustomer(db: Db, actor: ShopActor, input: CreateCustomerInput, now = new Date()): Promise<Customer> {
  const { shopId, userId } = actor
  const id = newId()
  try {
    await db.batch([
      repo.insertCustomerStatement(db, { id, shopId, name: input.name, phone: input.phone, now }),
      auditStatement(db, { userId, shopId, requestId: actor.requestId }, { action: 'customer.create', targetType: 'customer', targetId: id }, now),
    ])
  }
  catch (error) {
    if (isUniqueViolation(error)) throw phoneTaken()
    throw error
  }
  return getCustomer(db, actor, id)
}

/** Name and phone at the version read (409 `VERSION_CONFLICT` when stale, `PHONE_TAKEN` for another's phone). Old orders keep the name they were saved with. */
export async function updateCustomer(db: Db, actor: ShopActor, customerId: string, input: UpdateCustomerInput, now = new Date()): Promise<Customer> {
  const { shopId, userId } = actor
  const before = await repo.findCustomer(db, shopId, customerId)
  if (!before) throw customerNotFound()
  const fields = (['name', 'phone'] as const).filter(field => before[field] !== input[field])
  try {
    await runBatch(db, [
      repo.updateCustomerStatement(db, { shopId, id: customerId, version: input.version, name: input.name, phone: input.phone, now }),
      requireOneChange(db),
      auditStatement(db, { userId, shopId, requestId: actor.requestId }, { action: 'customer.update', targetType: 'customer', targetId: customerId, data: { fields } }, now),
    ], customerChanged)
  }
  catch (error) {
    if (isUniqueViolation(error)) throw phoneTaken()
    throw error
  }
  return getCustomer(db, actor, customerId)
}

/** For an order (orders feature): the shop's customer, or 404 for another shop's or a missing one. */
export async function orderCustomer(db: Db, shopId: string, customerId: string): Promise<{ id: string, name: string, phone: string | null }> {
  const row = await repo.findCustomer(db, shopId, customerId)
  if (!row) throw customerNotFound()
  return { id: row.id, name: row.name, phone: row.phone }
}
