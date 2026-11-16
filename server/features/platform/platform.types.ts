/** Who made a privileged change, and where (docs/server/architecture.md → Audit). */
export interface AuditActor {
  userId: string
  /** The shop the change happened in; `null` for a platform action. */
  shopId: string | null
  requestId?: string
}

/** What changed: `shop.suspend` on `shop` <id>, with safe metadata (which fields, never secrets). */
export interface AuditEntry {
  action: string
  targetType: string
  targetId: string
  data?: Record<string, unknown>
}

/** An idempotency key and what it's for: the same UUID in another shop, from another user or for another action is another key. */
export interface IdempotencyScope {
  shopId: string
  actorUserId: string
  /** `order.create`, `order.payment`. */
  action: string
  /** The `Idempotency-Key` header: a UUID the client makes per user action. */
  key: string
}
