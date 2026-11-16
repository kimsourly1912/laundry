import type { Db, Statement } from '#server/utils/batch'
import { isUniqueViolation } from '#server/utils/batch'
import { apiError, ErrorCodes } from '#server/utils/errors'
import * as repo from './platform.repository'
import type { AuditActor, AuditEntry, IdempotencyScope } from './platform.types'

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

// --- Idempotency (docs/server/architecture.md → Idempotency) ---

/** How long a key replays; the purge job deletes older ones. */
export const IDEMPOTENCY_KEY_TTL_MS = 24 * 60 * 60 * 1000

export function idempotencyMismatch() {
  return apiError(422, ErrorCodes.IDEMPOTENCY_MISMATCH, 'This request was already sent with different details. Start again.')
}

/** SHA-256 (hex) of the validated request. Valibot's output keeps the schema's key order, so equal requests hash equal. */
async function requestHash(request: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(request)))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

/** The id an earlier use of the key answered with; 422 when it was for a different request. */
async function replayOf(db: Db, scope: IdempotencyScope, hash: string): Promise<string | undefined> {
  const stored = await repo.findIdempotencyKey(db, scope)
  if (!stored) return undefined
  if (stored.requestHash !== hash) throw idempotencyMismatch()
  return stored.response.id
}

interface IdempotentOptions {
  scope: IdempotencyScope
  /** The validated request; with the scope, it decides "same request". */
  request: unknown
  /**
   * Builds and runs the action's one batch, including `keyStatement(id)`, and returns the id of
   * the record it made or changed. Runs at most once per key.
   */
  perform: (keyStatement: (id: string) => Statement) => Promise<string>
  now?: Date
}

/**
 * Runs an action at most once per key: a repeat of the same request answers with the first one's
 * record id (`replayed: true`) and changes nothing. Two at once: the second batch fails on the key's
 * primary key, rolls back whole, and replays the first.
 *
 * @example
 * const { id, replayed } = await runIdempotent(db, { scope, request: input, perform: async (key) => {
 *   await runBatch(db, [...writes, key(orderId)], conflict)
 *   return orderId
 * } })
 */
export async function runIdempotent(db: Db, options: IdempotentOptions): Promise<{ id: string, replayed: boolean }> {
  const { scope, request, perform, now = new Date() } = options
  const hash = await requestHash(request)
  const earlier = await replayOf(db, scope, hash)
  if (earlier) return { id: earlier, replayed: true }
  try {
    const id = await perform(id => repo.insertIdempotencyKeyStatement(db, scope, { requestHash: hash, response: { id }, now }))
    return { id, replayed: false }
  }
  catch (error) {
    if (!isUniqueViolation(error)) throw error
    const winner = await replayOf(db, scope, hash)
    if (!winner) throw error
    return { id: winner, replayed: true }
  }
}

/** Across shops: deletes keys older than a day (the `platform:expire-idempotency-keys` job). */
export async function expireIdempotencyKeys(db: Db, now = new Date()): Promise<void> {
  await repo.deleteIdempotencyKeysBefore(db, new Date(now.getTime() - IDEMPOTENCY_KEY_TTL_MS))
}
