import { sql } from 'drizzle-orm'
import { integer, text } from 'drizzle-orm/sqlite-core'
import { schema as authSchema } from '#auth/schema'

/**
 * Column builders every feature's schema shares (docs/server/data-model.md → Conventions). Here,
 * not in one feature's schema, so two schemas can reference each other's tables without a circular
 * import (`shop_settings` → `images` → nothing).
 */

/** A shop is a Better Auth organization (spec T2); every shop table points at it, restrict. */
export const shopId = () => text().notNull().references(() => authSchema!.organization.id, { onDelete: 'restrict' })

/** The user who made the row; users are never deleted while they made records. */
export const createdBy = () => text().notNull().references(() => authSchema!.user.id, { onDelete: 'restrict' })

/** A UTC time in milliseconds. */
export const timestamp = () => integer({ mode: 'timestamp_ms' })

/** The database's own time, in milliseconds, as a column default. */
export const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`

/** `'a', 'b'` for a `CHECK (column in (…))` over a fixed list. */
export const inList = (values: readonly string[]) => sql.raw(values.map(value => `'${value}'`).join(', '))
