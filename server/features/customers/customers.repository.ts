import { and, count, desc, eq, isNull, or, sql } from 'drizzle-orm'
import type { Db, Statement } from '#server/utils/batch'
import { requireCount, updateAtVersion } from '#server/utils/batch'
import { containsText, firstRow } from '#server/utils/query'
import { customers } from './customers.schema'

const columns = {
  id: customers.id,
  name: customers.name,
  phoneE164: customers.phoneE164,
  note: customers.note,
  anonymizedAt: customers.anonymizedAt,
  createdAt: customers.createdAt,
  version: customers.version,
}

export interface CustomerRow {
  id: string
  name: string
  phoneE164: string | null
  note: string | null
  anonymizedAt: Date | null
  createdAt: Date
  version: number
}

// --- Reads (every one scoped to the shop) ---

export function findCustomer(db: Db, shopId: string, id: string): Promise<CustomerRow | undefined> {
  return firstRow(db.select(columns).from(customers).where(and(eq(customers.shopId, shopId), eq(customers.id, id))))
}

export function findByPhone(db: Db, shopId: string, phoneE164: string): Promise<CustomerRow | undefined> {
  return firstRow(db.select(columns).from(customers).where(and(eq(customers.shopId, shopId), eq(customers.phoneE164, phoneE164))))
}

interface Search {
  /** A name, or digits of a phone number. */
  text?: string
  /** Digits to find inside the E.164 number: the national number without its leading 0. */
  phoneDigits?: string
  limit: number
  offset: number
}

/**
 * The shop's customers who aren't anonymized, most recently changed first, a page at a time. A
 * search matches the name, or digits anywhere in the phone number. Scans the shop's rows
 * (`customers_shop_updated_idx` narrows to the shop).
 */
export async function listCustomers(db: Db, shopId: string, search: Search): Promise<{ rows: CustomerRow[], total: number }> {
  const { text, phoneDigits, limit, offset } = search
  const where = and(
    eq(customers.shopId, shopId),
    isNull(customers.anonymizedAt),
    text ? or(containsText(customers.name, text), phoneDigits ? sql`instr(${customers.phoneE164}, ${phoneDigits}) > 0` : undefined) : undefined,
  )
  const [rows, [counted]] = await db.batch([
    db.select(columns).from(customers).where(where).orderBy(desc(customers.updatedAt), desc(customers.id)).limit(limit).offset(offset),
    db.select({ total: count() }).from(customers).where(where),
  ])
  return { rows, total: counted?.total ?? 0 }
}

// --- Write statements ---

interface Fields {
  name: string
  phoneE164: string | null
  note: string | null
}

export function insertCustomerStatement(db: Db, row: Fields & { shopId: string, id: string, now: Date }): Statement {
  const { shopId, id, now, ...fields } = row
  return db.insert(customers).values({ id, shopId, ...fields, createdAt: now, updatedAt: now })
}

interface VersionKey {
  shopId: string
  id: string
  version: number
}

/** Edits a customer who isn't anonymized, at `version`. Follow with `requireOneChange`. */
export function updateCustomerStatement(db: Db, key: VersionKey, fields: Fields, now: Date): Statement {
  return updateAtVersion(db, customers, key, { ...fields, updatedAt: now }, isNull(customers.anonymizedAt))
}

/** Clears the name, phone and note (P11); the phone is free for another customer. */
export function anonymizeStatement(db: Db, key: VersionKey, now: Date): Statement {
  return updateAtVersion(db, customers, key, { name: '', phoneE164: null, note: null, anonymizedAt: now, updatedAt: now }, isNull(customers.anonymizedAt))
}

// --- Guards (abort the batch) ---

/** The customer is the shop's and not anonymized: still there when an order is made for them. */
export function requireActiveCustomer(db: Db, shopId: string, id: string): Statement {
  return requireCount(db, sql`${db.$count(customers, and(eq(customers.shopId, shopId), eq(customers.id, id), isNull(customers.anonymizedAt)))}`, 1)
}
