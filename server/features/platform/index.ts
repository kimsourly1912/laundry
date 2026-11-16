/** The platform feature's public API (docs/server/architecture.md → Features). */
export { auditStatement, expireIdempotencyKeys, IDEMPOTENCY_KEY_TTL_MS, idempotencyMismatch, runIdempotent } from './platform.service'
export type { AuditActor, AuditEntry, IdempotencyScope } from './platform.types'
