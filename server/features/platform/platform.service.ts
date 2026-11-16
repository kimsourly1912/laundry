import type { Db, Statement } from '#server/utils/batch'
import * as repo from './platform.repository'
import type { AuditActor, AuditEntry } from './platform.types'

/**
 * The audit row of a privileged write, for the caller's own batch (docs/server/architecture.md →
 * Audit): the write and its row commit together or not at all.
 *
 * @example
 * await runBatch(db, [...writes, auditStatement(db, { userId, shopId: null, requestId }, { action: 'shop.suspend', targetType: 'shop', targetId: shopId })], conflict)
 */
export function auditStatement(db: Db, actor: AuditActor, entry: AuditEntry, now = new Date()): Statement {
  return repo.insertAuditStatement(db, actor, entry, now)
}
