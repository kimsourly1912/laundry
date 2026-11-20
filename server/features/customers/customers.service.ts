import type { Page } from '#shared/contracts/common'
import { toPage } from '#shared/contracts/common'
import type { CreateCustomerInput, Customer, CustomerListQuery } from '#shared/contracts/customers'
import { toE164 } from '#shared/contracts/phone'
import type { Db } from '#server/utils/batch'
import { isUniqueViolation } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { auditStatement } from '#server/features/platform'
import type { ShopActor } from '#server/features/identity'
import { customerNotFound, phoneTaken } from './customers.errors'
import * as repo from './customers.repository'
import type { CustomerRow } from './customers.repository'

/**
 * The shop's customers (D39; product notes → customers): find one at the counter by phone or name,
 * or add one, under New order → More details. Audit rows never carry the values (personal data,
 * docs/server/security.md → Logging and privacy).
 */

function toCustomer(row: CustomerRow): Customer {
  return { ...row, createdAt: row.createdAt.toISOString() }
}

async function getCustomer(db: Db, actor: ShopActor, customerId: string): Promise<Customer> {
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

/** For an order (orders feature): the shop's customer, or 404 for another shop's or a missing one. */
export async function orderCustomer(db: Db, shopId: string, customerId: string): Promise<{ id: string, name: string, phone: string | null }> {
  const row = await repo.findCustomer(db, shopId, customerId)
  if (!row) throw customerNotFound()
  return { id: row.id, name: row.name, phone: row.phone }
}
