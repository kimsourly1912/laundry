import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { schema as authSchema } from '#auth/schema'

/**
 * The audit trail (spec §6, docs/server/data-model.md → audit_events): one row per privileged write,
 * in the same batch as the write. Append-only: nothing updates or deletes a row.
 *
 * - `shopId`: the shop the action happened **in** (an owner cancelling an order). `null` for a
 *   platform action (a super admin suspending a shop): the shop is then the target.
 * - `actorUserId` is plain text, not a foreign key: the trail outlives any account change.
 * - `data` says which fields changed, never their values when personal, never secrets.
 */
export const auditEvents = sqliteTable('audit_events', {
  id: text().primaryKey(),
  shopId: text().references(() => authSchema!.organization.id, { onDelete: 'restrict' }),
  actorUserId: text().notNull(),
  action: text().notNull(),
  targetType: text().notNull(),
  targetId: text().notNull(),
  data: text({ mode: 'json' }).$type<Record<string, unknown>>(),
  /** The request that made the change, to find its log lines. */
  requestId: text(),
  createdAt: integer({ mode: 'timestamp_ms' }).notNull().default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
}, table => [
  // A shop's history, and the platform's (shop_id null), newest first.
  index('audit_events_shop_idx').on(table.shopId, table.createdAt),
  // Everything that happened to one record (a shop's platform history: target 'shop', its id).
  index('audit_events_target_idx').on(table.targetType, table.targetId, table.createdAt),
])
