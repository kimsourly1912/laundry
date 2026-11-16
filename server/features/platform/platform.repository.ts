import type { Db, Statement } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { auditEvents } from './platform.schema'
import type { AuditActor, AuditEntry } from './platform.types'

// --- Write statements ---

export function insertAuditStatement(db: Db, actor: AuditActor, entry: AuditEntry, now: Date): Statement {
  return db.insert(auditEvents).values({
    id: newId(),
    shopId: actor.shopId,
    actorUserId: actor.userId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    data: entry.data ?? null,
    requestId: actor.requestId ?? null,
    createdAt: now,
  })
}
