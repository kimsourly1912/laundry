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
