import { and, asc, count, desc, eq, or } from 'drizzle-orm'
import type { Db, Statement } from '#server/utils/batch'
import { containsText, firstRow } from '#server/utils/query'
import { customers } from './customers.schema'

/** The shop's customers (data-model → customers): every function takes the shop and filters by it. */

const customerColumns = {
  id: customers.id,
  name: customers.name,
  phone: customers.phone,
  version: customers.version,
  createdAt: customers.createdAt,
}

export type CustomerRow = Awaited<ReturnType<typeof findCustomer>> & {}

export function findCustomer(db: Db, shopId: string, customerId: string) {
  return firstRow(db.select(customerColumns).from(customers).where(and(eq(customers.shopId, shopId), eq(customers.id, customerId))))
}

/** By name, a page at a time; `phone` matches exactly, `name` as part of the name. */
export async function listCustomers(db: Db, shopId: string, query: { page: number, pageSize: number, phone?: string, name?: string }) {
  const { page, pageSize, phone, name } = query
  const where = and(
    eq(customers.shopId, shopId),
    phone || name ? or(phone ? eq(customers.phone, phone) : undefined, name ? containsText(customers.name, name) : undefined) : undefined,
  )
  const [rows, [counted]] = await db.batch([
    db.select(customerColumns).from(customers).where(where).orderBy(asc(customers.name), desc(customers.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(customers).where(where),
  ])
  return { rows, total: counted?.total ?? 0 }
}

export function insertCustomerStatement(db: Db, customer: { id: string, shopId: string, name: string, phone: string | null, now: Date }): Statement {
  const { id, shopId, name, phone, now } = customer
  return db.insert(customers).values({ id, shopId, name, phone, version: 1, createdAt: now, updatedAt: now })
}
