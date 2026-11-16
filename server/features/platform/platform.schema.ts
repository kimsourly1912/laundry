import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
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

/**
 * Idempotency keys (spec T10, docs/server/architecture.md → Idempotency): one row per idempotent
 * action, written in the action's own batch. A key is scoped to its shop, actor and action: the
 * same UUID from another user or for another action is a different key. Purged after 24 hours.
 */
export const idempotencyKeys = sqliteTable('idempotency_keys', {
  shopId: text().notNull().references(() => authSchema!.organization.id, { onDelete: 'restrict' }),
  actorUserId: text().notNull(),
  action: text().notNull(),
  key: text().notNull(),
  /** SHA-256 of the validated request: the same key with a different request is refused. */
  requestHash: text().notNull(),
  /** What a replay answers with: the id of the record the action made or changed. */
  response: text({ mode: 'json' }).$type<{ id: string }>().notNull(),
  createdAt: integer({ mode: 'timestamp_ms' }).notNull().default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
}, table => [
  primaryKey({ name: 'idempotency_keys_pk', columns: [table.shopId, table.actorUserId, table.action, table.key] }),
  // The purge job: oldest first.
  index('idempotency_keys_created_idx').on(table.createdAt),
])
