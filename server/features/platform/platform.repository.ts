import { and, eq, lt } from 'drizzle-orm'
import type { Db, Statement } from '#server/utils/batch'
import { newId } from '#server/utils/ids'
import { firstRow } from '#server/utils/query'
import { auditEvents, idempotencyKeys } from './platform.schema'
import type { AuditActor, AuditEntry, IdempotencyScope } from './platform.types'

// --- Reads ---

export function findIdempotencyKey(db: Db, scope: IdempotencyScope) {
  return firstRow(db.select({ requestHash: idempotencyKeys.requestHash, response: idempotencyKeys.response }).from(idempotencyKeys).where(and(
    eq(idempotencyKeys.shopId, scope.shopId),
    eq(idempotencyKeys.actorUserId, scope.actorUserId),
    eq(idempotencyKeys.action, scope.action),
    eq(idempotencyKeys.key, scope.key),
  )))
}

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

/** Fails on the primary key when the key was already used: the batch it's in changes nothing. */
export function insertIdempotencyKeyStatement(db: Db, scope: IdempotencyScope, row: { requestHash: string, response: { id: string }, now: Date }): Statement {
  return db.insert(idempotencyKeys).values({ ...scope, requestHash: row.requestHash, response: row.response, createdAt: row.now })
}

/** Across shops: the purge job deletes every key made before `before`. */
export function deleteIdempotencyKeysBefore(db: Db, before: Date) {
  return db.delete(idempotencyKeys).where(lt(idempotencyKeys.createdAt, before))
}
